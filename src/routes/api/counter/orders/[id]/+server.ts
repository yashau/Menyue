import { json, type RequestHandler } from '@sveltejs/kit';
import { requireCsrf } from '$lib/server/auth';
import { canCounterTransition } from '$lib/server/counter';

export const PATCH: RequestHandler = async (event) => {
	if (!event.locals.counter) return json({ message: 'Unauthorized' }, { status: 401 });
	await requireCsrf(event);
	const body = (await event.request.json().catch(() => null)) as {
		status?: string;
		version?: number;
	} | null;
	if (!body?.status || !Number.isInteger(body.version))
		return json({ message: 'Invalid status request' }, { status: 400 });
	const version = body.version as number;

	const current = await event.platform!.env.DB.prepare(
		'SELECT status,restaurant_id FROM orders WHERE id=? AND restaurant_id=? AND version=?',
	)
		.bind(event.params.id, event.locals.counter.restaurantId, version)
		.first<{ status: string; restaurant_id: string }>();
	if (!current || !canCounterTransition(current.status, body.status))
		return json({ message: 'Order changed. Refresh and try again.' }, { status: 409 });

	const db = event.platform!.env.DB;
	const nextVersion = version + 1;
	// This key belongs to the requested transition, not a random delivery
	// attempt. The partial unique index added in migration 0013 makes the event
	// write idempotent if a second same-version request reaches the SELECT after
	// the winning update has committed.
	const transitionKey = `${event.params.id}:${version}:${body.status}`;
	const result = await db.batch([
		db
			.prepare(
				'UPDATE orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? AND status=? AND version=?',
			)
			.bind(body.status, event.params.id, current.restaurant_id, current.status, version),
		db
			.prepare(
				"INSERT OR IGNORE INTO order_events(id,order_id,type,payload_json,transition_key,actor_id,actor_name,actor_type) SELECT ?,?,'order.status.updated',?,?,?,?,'counter' WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND restaurant_id=? AND status=? AND version=?)",
			)
			.bind(
				crypto.randomUUID(),
				event.params.id,
				JSON.stringify({ from: current.status, to: body.status, version: nextVersion, actor: { id: event.locals.counter.operatorId, name: event.locals.counter.displayName, type: 'counter' } }),
				transitionKey,
				event.locals.counter.operatorId,
				event.locals.counter.displayName,
				event.params.id,
				current.restaurant_id,
				body.status,
				nextVersion,
			),
	]);
	if (!result[0].meta.changes) return json({ message: 'Order changed. Refresh and try again.' }, { status: 409 });

	await event.platform!.env.ORDER_HUB.getByName(current.restaurant_id)
		.fetch('https://order-hub/publish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'order.updated', orderId: event.params.id, version: nextVersion }),
		})
		.catch(() => null);
	return json({ updated: true, version: nextVersion, status: body.status, actor: { id: event.locals.counter.operatorId, name: event.locals.counter.displayName, type: 'counter' } });
};
