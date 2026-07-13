import { json, type RequestHandler } from '@sveltejs/kit';
import { counterOrders } from '$lib/server/counter';
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.counter) return json({ message: 'Unauthorized' }, { status: 401 });
	return json({ orders: await counterOrders(platform!.env.DB, locals.counter.restaurantId) });
};
