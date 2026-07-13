export type Rate = { numerator: bigint; denominator: bigint; source: 'fixed' | 'exchange-rate-api'; fetchedAt?: number; expiresAt?: number };
export type CurrencyQuote = { code: string; minorUnit: number; locale: string; rate: Rate; freshness: 'fresh' | 'stale' | 'fixed' };
const codePattern = /^[A-Z]{3}$/;
const apiUrl = (base: string) => `https://open.er-api.com/v6/latest/${base}`;

export const parseCurrencyCode = (value: unknown) => { const code = String(value ?? '').trim().toUpperCase(); return codePattern.test(code) ? code : null; };
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a;
export function decimalRate(value: string): Rate | null {
	const match = value.trim().match(/^(?:0|[1-9]\d{0,11})(?:\.(\d{1,12}))?$/);
	if (!match || /^0(?:\.0+)?$/.test(value.trim())) return null;
	const [whole, fraction = ''] = value.trim().split('.'); let n = BigInt(`${whole}${fraction}`), d = 10n ** BigInt(fraction.length); const divisor = gcd(n, d); n /= divisor; d /= divisor;
	return { numerator: n, denominator: d, source: 'fixed' };
}
export function rateToDecimal(rate: Pick<Rate,'numerator'|'denominator'>) { const whole = rate.numerator / rate.denominator; let remainder = rate.numerator % rate.denominator, fraction = ''; for (let i=0; remainder && i<12; i++) { remainder*=10n; fraction += (remainder/rate.denominator).toString(); remainder%=rate.denominator; } return fraction ? `${whole}.${fraction.replace(/0+$/,'')}` : whole.toString(); }
export const currencyDigits = (code: string) => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; } };
export function convertMinor(minor: bigint, baseUnit: number, quoteUnit: number, rate: Pick<Rate, 'numerator'|'denominator'>) { const n = minor * rate.numerator * 10n ** BigInt(quoteUnit); const d = rate.denominator * 10n ** BigInt(baseUnit); return (n + d / 2n) / d; }
export function formatMinor(minor: bigint | number, currency: string, locale = 'en', unit = currencyDigits(currency)) { const value = typeof minor === 'number' ? BigInt(Math.trunc(minor)) : minor; const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value; const scale = 10n ** BigInt(unit); const integer = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); const fraction = unit ? (absolute % scale).toString().padStart(unit, '0') : ''; const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: unit }).formatToParts(0); return sign + parts.map((part) => part.type === 'integer' ? integer : part.type === 'fraction' ? fraction : part.type === 'decimal' ? (unit ? part.value : '') : part.value).join(''); }
const valid = (n: string | null, d: string | null, source: Rate['source'], fetchedAt?: number, expiresAt?: number): Rate | null => { try { const numerator = BigInt(n ?? '0'), denominator = BigInt(d ?? '0'); return numerator > 0n && denominator > 0n ? { numerator, denominator, source, fetchedAt, expiresAt } : null; } catch { return null; } };

/** Render path is cache-only: it never calls an external provider. */
export async function displayQuotes(db: D1Database, restaurant: string): Promise<CurrencyQuote[]> {
	const now = Math.floor(Date.now() / 1000);
	const base = await db.prepare('SELECT currency,currency_minor_unit,currency_locale FROM restaurants WHERE id=?').bind(restaurant).first<{currency:string;currency_minor_unit:number;currency_locale:string}>();
	if (!base) return [];
	const rows = await db.prepare("SELECT c.currency_code,c.minor_unit,c.locale,c.rate_mode,c.fixed_numerator,c.fixed_denominator,s.numerator,s.denominator,s.source,s.fetched_at,s.expires_at FROM restaurant_currencies c LEFT JOIN currency_rate_sync s ON s.restaurant_id=c.restaurant_id AND s.base_currency=? AND s.quote_currency=c.currency_code WHERE c.restaurant_id=? AND c.enabled=1 AND c.is_base=0")
		.bind(base.currency, restaurant).all<{currency_code:string;minor_unit:number;locale:string;rate_mode:'fixed'|'api';fixed_numerator:string|null;fixed_denominator:string|null;numerator:string|null;denominator:string|null;source:Rate['source']|null;fetched_at:number|null;expires_at:number|null}>();
	return rows.results.flatMap((row) => { const fresh = row.expires_at && row.expires_at >= now ? valid(row.numerator,row.denominator,row.source ?? 'exchange-rate-api',row.fetched_at ?? undefined,row.expires_at) : null; const lkg = row.fetched_at && now - row.fetched_at <= 72*3600 ? valid(row.numerator,row.denominator,row.source ?? 'exchange-rate-api',row.fetched_at,row.expires_at ?? undefined) : null; const fixed = valid(row.fixed_numerator,row.fixed_denominator,'fixed'); const rate = row.rate_mode === 'fixed' ? fixed : fresh ?? lkg ?? fixed; if (!rate) return []; return [{ code: row.currency_code, minorUnit: row.minor_unit, locale: row.locale, rate, freshness: rate.source === 'fixed' ? 'fixed' : fresh ? 'fresh' : 'stale' }]; });
}

/** Explicit admin sync. Uses a fixed provider URL, bounded payload and epoch-based lease. */
export async function syncRates(db: D1Database, restaurant: string): Promise<number> {
	const base = await db.prepare('SELECT currency FROM restaurants WHERE id=?').bind(restaurant).first<{currency:string}>(); if (!base) return 0;
	const quotes = await db.prepare("SELECT currency_code FROM restaurant_currencies WHERE restaurant_id=? AND enabled=1 AND is_base=0 AND rate_mode='api'").bind(restaurant).all<{currency_code:string}>();
	let updated = 0; const now = Math.floor(Date.now()/1000);
	for (const quote of quotes.results) {
		await db.prepare("INSERT OR IGNORE INTO currency_rate_sync(restaurant_id,base_currency,quote_currency,numerator,denominator,source,fetched_at,expires_at,lease_until) VALUES(?,?,?,?,?,'exchange-rate-api',0,0,NULL)").bind(restaurant,base.currency,quote.currency_code,'1','1').run();
		const lease = await db.prepare('UPDATE currency_rate_sync SET lease_until=? WHERE restaurant_id=? AND base_currency=? AND quote_currency=? AND (lease_until IS NULL OR lease_until < ?)').bind(now+20,restaurant,base.currency,quote.currency_code,now).run(); if (!lease.meta.changes) continue;
		try { const response = await fetch(apiUrl(base.currency), { headers: { accept:'application/json' }, signal: AbortSignal.timeout(5000) }); const declared=Number(response.headers.get('content-length') ?? 0); if (declared > 256_000) continue; const payload=await response.text(); if (payload.length > 256_000) continue; const body = JSON.parse(payload) as {result?:string;base_code?:string;time_last_update_unix?:number;rates?:Record<string,unknown>}; const raw = body.rates?.[quote.currency_code]; const value = body.result === 'success' && (!body.base_code || body.base_code === base.currency) && typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 1e12 ? decimalRate(String(raw)) : null; if (!response.ok || !value) continue; await db.prepare("UPDATE currency_rate_sync SET numerator=?,denominator=?,source='exchange-rate-api',fetched_at=?,expires_at=?,lease_until=NULL,revision=revision+1 WHERE restaurant_id=? AND base_currency=? AND quote_currency=?").bind(value.numerator.toString(),value.denominator.toString(),now,now+86400,restaurant,base.currency,quote.currency_code).run(); updated++; } finally { await db.prepare('UPDATE currency_rate_sync SET lease_until=NULL WHERE restaurant_id=? AND base_currency=? AND quote_currency=?').bind(restaurant,base.currency,quote.currency_code).run(); }
	}
	if (updated) await db.prepare('UPDATE restaurants SET rate_revision=rate_revision+1 WHERE id=?').bind(restaurant).run(); return updated;
}
