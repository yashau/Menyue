import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { requireCounter } from '$lib/server/auth';
import { loadBoardOrders } from '$lib/server/orders';
import { getRestaurant } from '$lib/server/currency';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) throw redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	const user = requireCounter(locals.user);
	const db = getDB(platform);
	const [orders, restaurant] = await Promise.all([
		loadBoardOrders(db, user.restaurantId, { includeClosed: true }),
		getRestaurant(db, user.restaurantId)
	]);
	return {
		user: { displayName: user.displayName, role: user.role },
		csrf: user.csrfSecret,
		orders,
		base: restaurant.base
	};
};
