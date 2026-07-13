import { describe, expect, it, vi } from 'vitest';
import { adminDashboardMetricsQuery, getAdminDashboardMetrics } from '../../src/lib/server/admin-dashboard';
import { formatMinor } from '../../src/lib/server/currency';

describe('admin dashboard metrics', () => {
	it('uses one tenant-bound projection and retains minor-unit totals exactly', async () => {
		const first = vi.fn().mockResolvedValue({
			currency: 'MVR',
			currencyMinorUnit: 2,
			currencyLocale: 'dv-MV',
			categoryCount: 3,
			itemCount: 9,
			unavailableItemCount: 2,
			optionCount: 12,
			suggestionCount: 4,
			beveragePromptCount: 1,
			beverageTargetCount: 2,
			tableCount: 8,
			enabledTableCount: 7,
			ordersToday: 6,
			completedToday: 3,
			cancelledToday: 1,
			salesTodayMinor: '9007199254740993123',
			revenueTodayMinor: '125050',
			newOrders: 1,
			acceptedOrders: 2,
			preparingOrders: 1,
			readyOrders: 0,
		});
		const bind = vi.fn(() => ({ first }));
		const prepare = vi.fn(() => ({ bind }));
		const db = { prepare } as unknown as D1Database;

		const metrics = await getAdminDashboardMetrics(db, 'restaurant-a');

		expect(prepare).toHaveBeenCalledTimes(1);
		expect(bind).toHaveBeenCalledWith('restaurant-a');
		expect(metrics).toMatchObject({
			categoryCount: 3,
			itemCount: 9,
			unavailableItemCount: 2,
			readyOrders: 0,
			salesTodayMinor: '9007199254740993123',
		});
		expect(formatMinor(BigInt(metrics.salesTodayMinor), metrics.currency, metrics.currencyLocale, metrics.currencyMinorUnit)).toContain(
			'90,071,992,547,409,931.23',
		);
	});

	it('keeps all scoped data behind the restaurant CTE and uses current-currency snapshots', () => {
		expect(adminDashboardMetricsQuery).toContain('WHERE id=?');
		expect(adminDashboardMetricsQuery).toContain('JOIN restaurant r ON r.id=o.restaurant_id');
		expect(adminDashboardMetricsQuery).toContain('snapshot.currency_code=r.currency');
		expect(adminDashboardMetricsQuery).toContain("o.status IN ('new','accepted','preparing','ready')");
		expect(adminDashboardMetricsQuery).toContain("o.created_at>=date('now')");
		expect(adminDashboardMetricsQuery.match(/\?/g)).toHaveLength(1);
	});
});
