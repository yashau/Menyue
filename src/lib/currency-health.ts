export type CurrencyHealthInput = {
	currency_code: string;
	enabled: number;
	is_base: number;
	rate_mode: 'fixed' | 'api';
	updated_at: number;
	fixed_numerator: string | null;
	fixed_denominator: string | null;
	fetched_at: number | null;
	expires_at: number | null;
};

export type CurrencyHealth = {
	code: string;
	source: 'base' | 'fixed' | 'exchange-rate-api';
	status: 'base' | 'configured' | 'fresh' | 'stale' | 'unavailable';
	updatedAt: number | null;
	orderingImpact: string;
};

const validRate = (numerator: string | null, denominator: string | null) => {
	try { return BigInt(numerator ?? '0') > 0n && BigInt(denominator ?? '0') > 0n; } catch { return false; }
};

/** Matches displayQuotes: cached rates remain usable for 72 hours, then a fixed fallback is used. */
export function currencyHealth(rows: CurrencyHealthInput[], now = Math.floor(Date.now() / 1000)): CurrencyHealth[] {
	return rows.filter((row) => Number(row.enabled) === 1).map((row) => {
		if (Number(row.is_base) === 1) return { code: row.currency_code, source: 'base', status: 'base', updatedAt: row.updated_at || null, orderingImpact: 'Orders are charged in this currency.' };
		const fixed = validRate(row.fixed_numerator, row.fixed_denominator);
		if (row.rate_mode === 'fixed') return { code: row.currency_code, source: 'fixed', status: fixed ? 'configured' : 'unavailable', updatedAt: row.updated_at || null, orderingImpact: fixed ? 'Guest amounts are estimates; orders stay in the base currency.' : 'Guest quote is hidden; orders stay in the base currency.' };
		const fetched = row.fetched_at && row.fetched_at > 0 ? row.fetched_at : null;
		if (fetched && row.expires_at && row.expires_at >= now) return { code: row.currency_code, source: 'exchange-rate-api', status: 'fresh', updatedAt: fetched, orderingImpact: 'Guest amounts are estimates; orders stay in the base currency.' };
		if (fetched && now - fetched <= 72 * 3600) return { code: row.currency_code, source: 'exchange-rate-api', status: 'stale', updatedAt: fetched, orderingImpact: 'Last known quote is shown; orders stay in the base currency.' };
		if (fixed) return { code: row.currency_code, source: 'fixed', status: 'stale', updatedAt: row.updated_at || null, orderingImpact: 'Fixed fallback is shown; orders stay in the base currency.' };
		return { code: row.currency_code, source: 'exchange-rate-api', status: 'unavailable', updatedAt: fetched, orderingImpact: 'Guest quote is hidden; orders stay in the base currency.' };
	});
}
