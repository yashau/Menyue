import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { resolveTable } from '$lib/server/guest';
import { getRestaurant } from '$lib/server/currency';
import { submitOrder, type OrderLineInput } from '$lib/server/order';

export const POST: RequestHandler = async ({ params, request, platform, url }) => {
	// Same-origin guard (CSRF): reject cross-site form posts when an Origin is present.
	const origin = request.headers.get('origin');
	if (origin && new URL(origin).host !== url.host) {
		throw error(403, 'Cross-origin requests are not allowed.');
	}

	const db = getDB(platform);
	const table = await resolveTable(db, params.token);
	if (!table) throw error(404, 'Table not found');

	let body: {
		idempotencyKey?: string;
		lines?: OrderLineInput[];
		notes?: string;
		displayCurrencyCode?: string;
	};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid request body.');
	}
	if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
		throw error(400, 'Missing idempotency key.');
	}

	const restaurant = await getRestaurant(db, table.restaurantId);
	const result = await submitOrder(db, restaurant, table, {
		idempotencyKey: body.idempotencyKey,
		lines: body.lines ?? [],
		notes: body.notes,
		displayCurrencyCode: body.displayCurrencyCode
	});
	return json(result);
};
