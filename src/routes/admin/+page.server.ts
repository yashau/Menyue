import type { PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = getDB(platform);
	const rid = locals.restaurantId;
	const stat = async (sql: string) =>
		(await db.prepare(sql).bind(rid).first<{ n: number }>())?.n ?? 0;

	const [items, live, unavailable, cats, tables, activeTables, currencies, ordersActive, ordersTotal] =
		await Promise.all([
			stat('SELECT COUNT(*) n FROM items WHERE restaurant_id = ?'),
			stat('SELECT COUNT(*) n FROM items WHERE restaurant_id = ? AND enabled = 1'),
			stat("SELECT COUNT(*) n FROM items WHERE restaurant_id = ? AND availability = 'unavailable'"),
			stat('SELECT COUNT(*) n FROM categories WHERE restaurant_id = ?'),
			stat('SELECT COUNT(*) n FROM tables WHERE restaurant_id = ?'),
			stat('SELECT COUNT(*) n FROM tables WHERE restaurant_id = ? AND enabled = 1'),
			stat('SELECT COUNT(*) n FROM currencies WHERE restaurant_id = ? AND enabled = 1'),
			stat("SELECT COUNT(*) n FROM orders WHERE restaurant_id = ? AND status IN ('new','accepted','preparing')"),
			stat('SELECT COUNT(*) n FROM orders WHERE restaurant_id = ?')
		]);

	return {
		stats: { items, live, unavailable, cats, tables, activeTables, currencies, ordersActive, ordersTotal }
	};
};
