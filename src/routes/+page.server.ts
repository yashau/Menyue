import type { PageServerLoad } from './$types';
import { getDB, PRIMARY_RESTAURANT_ID } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDB(platform);
	const restaurant = await db
		.prepare('SELECT name FROM restaurants WHERE id = ?')
		.bind(PRIMARY_RESTAURANT_ID)
		.first<{ name: string }>();
	const table = await db
		.prepare('SELECT token FROM tables WHERE restaurant_id = ? AND enabled = 1 ORDER BY id LIMIT 1')
		.bind(PRIMARY_RESTAURANT_ID)
		.first<{ token: string }>();
	return {
		restaurantName: restaurant?.name ?? 'Menyue',
		demoToken: table?.token ?? null
	};
};
