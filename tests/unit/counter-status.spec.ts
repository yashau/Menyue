import { describe, expect, it } from 'vitest';
import { canCounterTransition, counterTransitions } from '$lib/server/counter';

describe('counter status transitions', () => {
	it('allows only the linear service workflow and cancellation', () => {
		expect(counterTransitions.new).toEqual(['accepted', 'cancelled']);
		expect(canCounterTransition('accepted', 'preparing')).toBe(true);
		expect(canCounterTransition('ready', 'completed')).toBe(true);
		expect(canCounterTransition('preparing', 'cancelled')).toBe(true);
	});

	it('rejects stale, terminal, and skipped transitions', () => {
		expect(canCounterTransition('new', 'ready')).toBe(false);
		expect(canCounterTransition('completed', 'cancelled')).toBe(false);
		expect(canCounterTransition('cancelled', 'accepted')).toBe(false);
		expect(canCounterTransition('unknown', 'accepted')).toBe(false);
	});
});
