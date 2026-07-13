import { describe, expect, it } from 'vitest';
import { addOrderLineTotal, MAX_MONEY_MINOR } from '../../src/lib/server/order-totals';
import { parsePromotionMinor } from '../../src/lib/server/promotion-price';

describe('order money guardrails', () => {
	it('rejects negative promotions and permits the defined price boundary', () => {
		expect(() => parsePromotionMinor('-0.01')).toThrow(RangeError);
		expect(parsePromotionMinor('10000000')).toBe(MAX_MONEY_MINOR);
		expect(() => parsePromotionMinor('10000000.01')).toThrow(RangeError);
	});

	it('requires safe non-negative unit, line, and aggregate totals', () => {
		expect(addOrderLineTotal(250, 4, 100)).toBe(1000);
		expect(addOrderLineTotal(-1, 1, 0)).toBeNull();
		expect(addOrderLineTotal(MAX_MONEY_MINOR, 2, 0)).toBeNull();
		expect(addOrderLineTotal(1, 1, MAX_MONEY_MINOR)).toBeNull();
	});
});
