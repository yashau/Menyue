import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { assertCsrf, requireCounter } from '$lib/server/auth';
import { updateOrderStatus } from '$lib/server/orders';
import type { OrderStatus } from '$lib/types';

const VALID: OrderStatus[] = ['accepted', 'preparing', 'completed', 'cancelled'];

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const user = requireCounter(locals.user);
	assertCsrf(user, request.headers.get('x-csrf'));
	const db = getDB(platform);
	const body = (await request.json().catch(() => ({}))) as { orderId?: number; status?: OrderStatus };
	if (!body.orderId || !body.status || !VALID.includes(body.status)) {
		throw error(400, 'Invalid status change.');
	}
	const result = await updateOrderStatus(db, user.restaurantId, body.orderId, body.status, user.username);
	if (!result.ok) throw error(409, result.reason ?? 'Status change not allowed.');
	return json({ ok: true });
};
