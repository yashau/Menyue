export type ClientDisplayCurrency = { code: string; numerator: string; denominator: string; minorUnit?: number; locale?: string; freshness?: 'fresh'|'stale'|'fixed'; source?: string };
export type ClientBaseCurrency = { code: string; minorUnit: number; locale: string };

const digits = (currency: string) => {
	try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; }
	catch { return 2; }
};

const numberFormat = (locale: string, currency: string, unit: number) => {
	try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: unit, maximumFractionDigits: unit }); }
	catch { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: unit, maximumFractionDigits: unit }); }
};

export function convertClientMinor(minor: bigint | number, base: string, quote: ClientDisplayCurrency): bigint {
	const source = typeof minor === 'bigint' ? minor : BigInt(Math.trunc(minor));
	const numerator = source * BigInt(quote.numerator) * 10n ** BigInt(quote.minorUnit ?? digits(quote.code));
	const denominator = BigInt(quote.denominator) * 10n ** BigInt(digits(base));
	return (numerator + denominator / 2n) / denominator;
}

export function clientMoney(minor: bigint | number, currency: string, unit = digits(currency), locale = 'en-US'): string {
	const precision = unit;
	const value = typeof minor === 'bigint' ? minor : BigInt(Math.trunc(minor));
	const sign = value < 0n ? '-' : '';
	const absolute = value < 0n ? -value : value;
	const scale = 10n ** BigInt(precision);
	const whole = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const fraction = precision ? `.${(absolute % scale).toString().padStart(precision, '0')}` : '';
	const base = numberFormat(locale, currency, precision).formatToParts(0);
	return sign + base.map((part) => part.type === 'integer' ? whole : part.type === 'fraction' ? fraction.slice(1) : part.type === 'decimal' ? (precision ? part.value : '') : part.value).join('');
}

export function customerMoney(minor: bigint | number, base: ClientBaseCurrency, quote?: ClientDisplayCurrency): string {
	return quote
		? clientMoney(convertClientMinor(minor, base.code, quote), quote.code, quote.minorUnit ?? digits(quote.code), quote.locale ?? 'en-US')
		: clientMoney(minor, base.code, base.minorUnit, base.locale);
}

export function currencyLabel(code: string, locale = 'en-US'): string {
	try { return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code; }
	catch { return code; }
}
