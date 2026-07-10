import { json, type RequestHandler } from '@sveltejs/kit';
import { requireCsrf } from '$lib/server/auth';
const next: Record<string, string[]> = {
	new: ['accepted', 'cancelled'],
	accepted: ['preparing', 'cancelled'],
	preparing: ['ready', 'cancelled'],
	ready: ['completed', 'cancelled'],
	completed: [],
	cancelled: [],
};
export const PATCH: RequestHandler = async (e) => {
	if (!e.locals.counter) return json({ message: 'Unauthorized' }, { status: 401 });
	await requireCsrf(e);
	const b = (await e.request.json()) as { status?: string; version?: number };
	if (!b.status || !Number.isInteger(b.version))
		return json({ message: 'Invalid status' }, { status: 400 });
	const version = b.version as number,
		current = await e
			.platform!.env.DB.prepare(
				'SELECT status,restaurant_id FROM orders WHERE id=? AND restaurant_id=? AND version=?',
			)
			.bind(e.params.id, 'demo', version)
			.first<{ status: string; restaurant_id: string }>();
	if (!current || !next[current.status]?.includes(b.status))
		return json({ message: 'Order changed' }, { status: 409 });
	const r = await e
		.platform!.env.DB.prepare(
			'UPDATE orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? AND version=?',
		)
		.bind(b.status, e.params.id, current.restaurant_id, version)
		.run();
	if (!r.meta.changes) return json({ message: 'Order changed' }, { status: 409 });
	await e
		.platform!.env.ORDER_HUB.getByName(current.restaurant_id)
		.fetch('https://order-hub/publish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'order.updated', orderId: e.params.id, version: version + 1 }),
		})
		.catch(() => null);
	return json({ updated: true, version: version + 1 });
};
