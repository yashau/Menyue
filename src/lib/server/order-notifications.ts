type OrderNotificationPlatform = Pick<App.Platform, 'env' | 'ctx'>;

/**
 * Realtime delivery is a projection of an already-committed order. It must
 * never affect the HTTP result, because a client may safely retry that result.
 */
export function publishOrderCreated(
	platform: OrderNotificationPlatform,
	restaurantId: string,
	orderId: string,
): void {
	const publication = Promise.resolve()
		.then(() =>
			platform.env.ORDER_HUB.getByName(restaurantId).fetch('https://order-hub/publish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'order.created', orderId, version: 1 }),
			}),
		)
		.catch(() => undefined);
	try {
		platform.ctx.waitUntil(publication);
	} catch {
		// A local/mock execution context may not support background work. The
		// committed order remains successful in either case.
	}
}
