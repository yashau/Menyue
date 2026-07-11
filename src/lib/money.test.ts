import { describe, it, expect } from 'vitest';
import { formatBaseMinor, convertAndFormat, majorToMinor, minorToMajor, type CurrencyFormat } from './money';

const MVR: CurrencyFormat = { code: 'MVR', symbol: 'Rf', precision: 2, symbolPosition: 'after' };
const USD: CurrencyFormat = { code: 'USD', symbol: '$', precision: 2, symbolPosition: 'before' };
const JPY: CurrencyFormat = { code: 'JPY', symbol: '¥', precision: 0, symbolPosition: 'before' };

describe('money', () => {
	it('formats base minor units with symbol position and grouping', () => {
		expect(formatBaseMinor(16500, MVR)).toBe('165.00 Rf');
		expect(formatBaseMinor(1234567, MVR)).toBe('12,345.67 Rf');
		expect(formatBaseMinor(0, MVR)).toBe('0.00 Rf');
	});

	it('formats before-symbol currencies', () => {
		expect(formatBaseMinor(500, USD)).toBe('$5.00');
	});

	it('respects zero precision', () => {
		// 1650 base minor (precision 2) = 16.50 -> at rate 15 => 247.5 -> JPY 0dp = 248
		expect(convertAndFormat(1650, 2, 15, JPY)).toBe('¥248');
	});

	it('converts base minor into a display currency', () => {
		// 16500 minor MVR = 165.00; rate 0.0649 USD per MVR => ~10.71
		expect(convertAndFormat(16500, 2, 0.0649, USD)).toBe('$10.71');
	});

	it('round-trips major<->minor', () => {
		expect(majorToMinor(165, 2)).toBe(16500);
		expect(minorToMajor(16500, 2)).toBe(165);
		expect(majorToMinor(0.1, 2)).toBe(10);
	});

	it('handles negatives', () => {
		expect(formatBaseMinor(-500, USD)).toBe('-$5.00');
	});
});
