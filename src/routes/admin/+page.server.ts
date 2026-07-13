import type { PageServerLoad } from './$types';
import { getAdminDashboardMetrics, getMenuDashboardMetrics } from '$lib/server/admin-dashboard';
import { formatMinor } from '$lib/server/currency';
import { requireCapability } from '$lib/server/permissions';
import { restaurantId } from '$lib/server/restaurant';

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'menu:write');
	const restaurant = restaurantId(platform!.env);
	if (locals.user!.role !== 'admin') {
		const metrics = await getMenuDashboardMetrics(platform!.env.DB, restaurant);
		return {
			isAdmin: false,
			metrics: {
				...metrics,
				unavailableItemCount: metrics.unavailableItemCount,
				tableCount: 0,
				enabledTableCount: 0,
				ordersToday: 0,
				completedToday: 0,
				cancelledToday: 0,
				salesTodayMinor: '0',
				revenueTodayMinor: '0',
				salesToday: formatMinor(0, metrics.currency, metrics.currencyLocale, metrics.currencyMinorUnit),
				revenueToday: formatMinor(0, metrics.currency, metrics.currencyLocale, metrics.currencyMinorUnit),
				newOrders: 0,
				acceptedOrders: 0,
				preparingOrders: 0,
				readyOrders: 0,
			},
		};
	}
	const metrics = await getAdminDashboardMetrics(platform!.env.DB, restaurant);
	return {
		isAdmin: true,
		metrics: {
			...metrics,
			salesToday: formatMinor(
				BigInt(metrics.salesTodayMinor),
				metrics.currency,
				metrics.currencyLocale,
				metrics.currencyMinorUnit,
			),
			revenueToday: formatMinor(
				BigInt(metrics.revenueTodayMinor),
				metrics.currency,
				metrics.currencyLocale,
				metrics.currencyMinorUnit,
			),
		},
	};
};
