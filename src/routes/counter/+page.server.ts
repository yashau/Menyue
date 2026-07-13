import { redirect } from '@sveltejs/kit';
import { counterOrders } from '$lib/server/counter';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.counter) throw redirect(303, '/counter/login');
	return { orders: await counterOrders(platform!.env.DB, locals.counter.restaurantId) };
};
