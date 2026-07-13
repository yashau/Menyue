import { describe, expect, it } from 'vitest';
import {
	COUNTER_CLOSED_HISTORY_DAYS,
	COUNTER_CLOSED_HISTORY_LIMIT,
	counterOrders,
	isCounterOrderVisible,
} from '../../src/lib/server/counter';

type QueryCall = { sql: string; args: unknown[] };

function projectionDb() {
	const calls: QueryCall[] = [];
	const rows = {
		orders: [
			{
				id: 'active-old', display_number: 1, status: 'new', note: 'leave at counter', total_minor: 1200, currency: 'USD', version: 1,
				created_at: '2026-01-01 08:00:00', updated_at: '2026-01-01 08:00:00', label: 'A1', currency_minor_unit: 2, currency_locale: 'en-US',
			},
			{
				id: 'closed-recent', display_number: 2, status: 'completed', note: null, total_minor: 700, currency: 'USD', version: 2,
				created_at: '2026-07-12 08:00:00', updated_at: '2026-07-12 09:00:00', label: 'A2', currency_minor_unit: 2, currency_locale: 'en-US',
			},
		],
		totals: [{ order_id: 'active-old', currency: 'USD', total_minor: 1200, minor_unit: 2, locale: 'en-US' }],
		lines: [{ order_id: 'active-old', id: 'line-1', item_id: 'item-1', item_name: 'Noodles', unit_minor: 1200, quantity: 1, total_minor: 1200, note: 'no chilli' }],
		choices: [
			{ order_id: 'active-old', line_id: 'line-1', group_name: 'Spice', choice_name: 'Mild', price_delta_minor: 0 },
			// A row from another tenant/order must never be attached if a database returned it unexpectedly.
			{ order_id: 'other-restaurant', line_id: 'other-line', group_name: 'Leak', choice_name: 'No', price_delta_minor: 1 },
		],
	};
	const db = {
		prepare(sql: string) {
			const call: QueryCall = { sql, args: [] };
			calls.push(call);
			return {
				bind(...args: unknown[]) {
					call.args = args;
					return {
						all: async () => ({
							results: sql.includes('SELECT o.id,o.display_number')
								? rows.orders
								: sql.includes('SELECT s.order_id')
									? rows.totals
									: sql.includes('SELECT l.order_id,l.id')
										? rows.lines
										: rows.choices,
						}),
					};
				},
			};
		},
	};
	return { db: db as unknown as D1Database, calls };
}

describe('counter order projection', () => {
	it('uses four bounded tenant-scoped queries and assembles totals, notes, and choices', async () => {
		const { db, calls } = projectionDb();
		const orders = await counterOrders(db, 'restaurant-a');

		expect(calls).toHaveLength(4);
		for (const call of calls) {
			expect(call.args).toEqual(['restaurant-a', `-${COUNTER_CLOSED_HISTORY_DAYS} days`, COUNTER_CLOSED_HISTORY_LIMIT]);
			expect(call.sql).toContain("o.status IN ('new','accepted','preparing','ready')");
			expect(call.sql).toContain("o.status IN ('completed','cancelled') AND o.updated_at >= datetime('now', ?)");
			expect(call.sql).toContain('LIMIT ?');
		}
		expect(orders).toHaveLength(2);
		expect(orders[0]).toMatchObject({ id: 'active-old', note: 'leave at counter', totals: [{ currency: 'USD', total_minor: 1200 }] });
		expect(orders[0].lines).toEqual([
			{
				id: 'line-1', item_id: 'item-1', item_name: 'Noodles', unit_minor: 1200, quantity: 1, total_minor: 1200, note: 'no chilli',
				choices: [{ group_name: 'Spice', choice_name: 'Mild', price_delta_minor: 0 }],
			},
		]);
		expect(orders[1].totals).toEqual([{ currency: 'USD', total_minor: 700, minor_unit: 2, locale: 'en-US' }]);
		expect(orders.flatMap((order) => order.lines).flatMap((line) => line.choices)).not.toContainEqual(expect.objectContaining({ group_name: 'Leak' }));
	});

	it('retains active work regardless of age and bounds closed history to seven days', () => {
		const now = new Date('2026-07-13T12:00:00Z');
		expect(isCounterOrderVisible({ status: 'ready', updated_at: '2020-01-01 00:00:00' }, now)).toBe(true);
		expect(isCounterOrderVisible({ status: 'completed', updated_at: '2026-07-12 12:00:00' }, now)).toBe(true);
		expect(isCounterOrderVisible({ status: 'cancelled', updated_at: '2026-07-06 11:59:59' }, now)).toBe(false);
	});
});
