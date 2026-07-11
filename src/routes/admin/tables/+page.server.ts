import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { assertCsrf, randomToken, requireMenuEditor } from '$lib/server/auth';
import { getRestaurant } from '$lib/server/currency';

// Never let the dev listen address leak into customer-facing links.
function safeOrigin(appOrigin: string | null, requestOrigin: string): string {
	let origin = (appOrigin && appOrigin.trim()) || requestOrigin;
	origin = origin.replace('0.0.0.0', 'localhost');
	return origin.replace(/\/$/, '');
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const db = getDB(platform);
	const rid = locals.restaurantId;
	const [tables, restaurant] = await Promise.all([
		db.prepare('SELECT id, label, token, enabled, created_at FROM tables WHERE restaurant_id = ? ORDER BY id').bind(rid).all<{ id: number; label: string; token: string; enabled: number; created_at: number }>(),
		getRestaurant(db, rid)
	]);
	return {
		tables: tables.results,
		linkOrigin: safeOrigin(restaurant.appOrigin, url.origin),
		appOrigin: restaurant.appOrigin
	};
};

export const actions: Actions = {
	create: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const label = String(form.get('label') ?? '').trim();
		if (!label) return fail(400, { error: 'Label required' });
		const token = `tbl_${randomToken(10)}`;
		await db.prepare('INSERT INTO tables (restaurant_id, label, token, enabled, created_at) VALUES (?, ?, ?, 1, unixepoch())').bind(user.restaurantId, label, token).run();
		return { saved: true };
	},
	toggle: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		const value = form.get('value') === '1' ? 1 : 0;
		await db.prepare('UPDATE tables SET enabled=? WHERE id=? AND restaurant_id=?').bind(value, id, user.restaurantId).run();
		return { saved: true };
	},
	remove: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		await db.prepare('DELETE FROM tables WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId).run();
		return { saved: true };
	}
};
