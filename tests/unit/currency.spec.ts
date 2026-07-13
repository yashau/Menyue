import { describe, expect, it } from 'vitest';
import { convertMinor, decimalRate, formatMinor } from '../../src/lib/server/currency';
import { clientMoney, convertClientMinor, customerMoney } from '../../src/lib/currency';

describe('currency conversion', () => {
	it('parses fixed decimal rates without floating point loss', () => {
		const rate = decimalRate('0.065');
		expect(rate).toMatchObject({ numerator: 13n, denominator: 200n });
	});
	it('uses deterministic half-up integer rounding', () => {
		const rate = decimalRate('1.005')!;
		expect(convertMinor(100n, 2, 2, rate)).toBe(101n);
	});
	it('formats amounts beyond Number safe precision', () => {
		expect(formatMinor(9007199254740993123n, 'USD')).toContain('90,071,992,547,409,931.23');
	});
	it('uses the configured locale and minor units for customer display values', () => {
		const base = { code: 'USD', minorUnit: 2, locale: 'en-US' };
		const euro = { code: 'EUR', numerator: '23', denominator: '25', minorUnit: 2, locale: 'en-IE' };
		const pound = { code: 'GBP', numerator: '4', denominator: '5', minorUnit: 2, locale: 'en-GB' };
		expect(customerMoney(1250, base)).toBe('$12.50');
		expect(customerMoney(1250, base, euro)).toBe('€11.50');
		expect(customerMoney(1250, base, pound)).toBe('£10.00');
		expect(convertClientMinor(1250n, 'USD', { code: 'JPY', numerator: '4', denominator: '5', minorUnit: 0 })).toBe(10n);
		expect(clientMoney(1234, 'USD', 0, 'en-US')).toBe('$1,234');
	});
});
