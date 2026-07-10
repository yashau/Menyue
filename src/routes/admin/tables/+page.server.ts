import { requireAdmin } from '$lib/server/permissions';
import { requireCsrf, sha256, base64url } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
const restaurant = 'demo',
	token = () => base64url(crypto.getRandomValues(new Uint8Array(24)));
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
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
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			raw = token();
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO dining_tables(id,restaurant_id,label,token_hash,token_hint) VALUES(?,?,?,?,?)',
			)
			.bind(
				crypto.randomUUID(),
				restaurant,
				String(f.get('label')),
				await sha256(raw),
				raw.slice(-6),
			)
			.run();
		return { newToken: raw };
	},
	rotate: async (e) => {
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
		return { newToken: raw };
	},
	toggle: async (e) => {
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
	},
};
