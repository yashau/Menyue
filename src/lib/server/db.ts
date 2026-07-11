import type { D1Database } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';

export function getDB(platform: App.Platform | undefined): D1Database {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database binding unavailable. Run migrations and restart dev server.');
	}
	return db;
}

// The application manages a single primary restaurant (id 1). Every query is
// still explicitly restaurant-scoped so cross-restaurant access is impossible.
export const PRIMARY_RESTAURANT_ID = 1;
