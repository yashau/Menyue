import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { requireCounter } from '$lib/server/auth';
import { loadBoardOrders } from '$lib/server/orders';

// Lightweight polling endpoint for live board updates.
export const GET: RequestHandler = async ({ locals, platform }) => {
	const user = requireCounter(locals.user);
	const db = getDB(platform);
	const orders = await loadBoardOrders(db, user.restaurantId, { includeClosed: true });
	return json({ orders, serverTime: Math.floor(Date.now() / 1000) });
};
