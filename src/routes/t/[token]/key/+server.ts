import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { resolveTable } from '$lib/server/guest';
import { issueIdempotencyKey } from '$lib/server/order';

// Server-issued idempotency key. No reliance on browser crypto.randomUUID().
export const POST: RequestHandler = async ({ params, platform }) => {
	const db = getDB(platform);
	const table = await resolveTable(db, params.token);
	if (!table) throw error(404, 'Table not found');
	const key = await issueIdempotencyKey(db, table.restaurantId, table.id);
	return json({ key });
};
