// Pure money helpers shared by client and server.
// Authoritative amounts are always integer minor units in the BASE currency.

export interface CurrencyFormat {
	code: string;
	symbol: string;
	precision: number;
	symbolPosition: 'before' | 'after';
}

export function minorToMajor(minor: number, precision: number): number {
	return minor / Math.pow(10, precision);
}

export function majorToMinor(major: number, precision: number): number {
	return Math.round(major * Math.pow(10, precision));
}

function groupThousands(intPart: string): string {
	return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMajor(major: number, fmt: CurrencyFormat): string {
	const negative = major < 0;
	const fixed = Math.abs(major).toFixed(fmt.precision);
	const [intPart, fracPart] = fixed.split('.');
	const grouped = groupThousands(intPart);
	const num = fracPart ? `${grouped}.${fracPart}` : grouped;
	const body = fmt.symbolPosition === 'before' ? `${fmt.symbol}${num}` : `${num} ${fmt.symbol}`;
	return negative ? `-${body}` : body;
}

// Format a base-currency minor amount in the base currency itself.
export function formatBaseMinor(minor: number, base: CurrencyFormat): string {
	return formatMajor(minorToMajor(minor, base.precision), base);
}

// Convert a base-currency minor amount into a display currency and format it.
// rate = units of display currency per 1 unit of base currency.
export function convertAndFormat(
	minorBase: number,
	basePrecision: number,
	rate: number,
	target: CurrencyFormat
): string {
	const major = minorToMajor(minorBase, basePrecision) * rate;
	return formatMajor(major, target);
}
