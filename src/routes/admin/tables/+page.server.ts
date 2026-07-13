import { requireAdmin } from '$lib/server/permissions';
import { requireCsrf, sha256, base64url } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { restaurantId, publicOrigin } from '$lib/server/restaurant';
import { audit } from '$lib/server/audit';
const token = () => base64url(crypto.getRandomValues(new Uint8Array(24)));
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const restaurant = restaurantId(platform!.env);
	return {
		tables: (
			await platform!.env.DB.prepare(
				'SELECT id,label,token_hint,enabled FROM dining_tables WHERE restaurant_id=? ORDER BY label',
			)
				.bind(restaurant)
				.all()
		).results,
	};
};
export const actions: Actions = {
	create: async (e) => {
		const restaurant = restaurantId(e.platform!.env);
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			raw = token();
		const tableId = crypto.randomUUID();
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO dining_tables(id,restaurant_id,label,token_hash,token_hint) VALUES(?,?,?,?,?)',
			)
			.bind(
				tableId,
				restaurant,
				String(f.get('label')),
				await sha256(raw),
				raw.slice(-6),
			)
			.run();
		await audit(e.platform!.env.DB, e.locals.user!.id, 'table.created', 'table', tableId, { label: String(f.get('label')) });
		return { newToken: raw, tableUrl: new URL(`/t/${raw}`, publicOrigin(e)).toString() };
	},
	rotate: async (e) => {
		const restaurant = restaurantId(e.platform!.env);
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			raw = token(),
			r = await e
				.platform!.env.DB.prepare(
					'UPDATE dining_tables SET token_hash=?,token_hint=? WHERE id=? AND restaurant_id=?',
				)
				.bind(await sha256(raw), raw.slice(-6), String(f.get('id')), restaurant)
				.run();
		if (!r.meta.changes) throw error(404);
		await audit(e.platform!.env.DB, e.locals.user!.id, 'table.token.rotated', 'table', String(f.get('id')));
		return { newToken: raw, tableUrl: new URL(`/t/${raw}`, publicOrigin(e)).toString() };
	},
	toggle: async (e) => {
		const restaurant = restaurantId(e.platform!.env);
		requireAdmin(e.locals);
		await requireCsrf(e);
		const id = String((await e.request.formData()).get('id')),
			r = await e
				.platform!.env.DB.prepare(
					'UPDATE dining_tables SET enabled=CASE enabled WHEN 1 THEN 0 ELSE 1 END WHERE id=? AND restaurant_id=?',
				)
				.bind(id, restaurant)
				.run();
		if (!r.meta.changes) throw error(404);
		await audit(e.platform!.env.DB, e.locals.user!.id, 'table.enabled.toggled', 'table', id);
	},
};
