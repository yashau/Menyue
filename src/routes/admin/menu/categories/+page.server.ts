import { error } from '@sveltejs/kit';
import { requireCapability } from '$lib/server/permissions';
import { requireCsrf } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'menu:write');
	const result = await platform!.env.DB.prepare(
		'SELECT id,name,description,enabled,position FROM menu_categories WHERE restaurant_id=? AND archived=0 ORDER BY position',
	)
		.bind('demo')
		.all();
	return { categories: result.results };
};
const revise = async (db: D1Database) =>
	db.prepare('UPDATE restaurants SET menu_revision=menu_revision+1 WHERE id=?').bind('demo').run();
export const actions: Actions = {
	create: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const form = await event.request.formData(),
			name = String(form.get('name') ?? '').trim();
		if (!name) return error(400, 'Name is required');
		const id = crypto.randomUUID();
		await event
			.platform!.env.DB.prepare(
				'INSERT INTO menu_categories(id,restaurant_id,code,name,position) VALUES(?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM menu_categories WHERE restaurant_id=?),0))',
			)
			.bind(id, 'demo', name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, 'demo')
			.run();
		await revise(event.platform!.env.DB);
	},
	update: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const f = await event.request.formData(),
			id = String(f.get('id'));
		const r = await event
			.platform!.env.DB.prepare(
				'UPDATE menu_categories SET name=?,description=?,enabled=?,version=version+1 WHERE id=? AND restaurant_id=?',
			)
			.bind(
				String(f.get('name') ?? ''),
				String(f.get('description') ?? ''),
				f.get('enabled') === 'on' ? 1 : 0,
				id,
				'demo',
			)
			.run();
		if (!r.meta.changes) throw error(404);
		await revise(event.platform!.env.DB);
	},
	move: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const f = await event.request.formData(),
			id = String(f.get('id')),
			direction = String(f.get('direction'));
		const rows = await event
			.platform!.env.DB.prepare(
				'SELECT id,position FROM menu_categories WHERE restaurant_id=? ORDER BY position',
			)
			.bind('demo')
			.all<{ id: string; position: number }>();
		const i = rows.results.findIndex((x) => x.id === id),
			j = direction === 'up' ? i - 1 : i + 1;
		if (i < 0 || j < 0 || j >= rows.results.length) throw error(400);
		await event.platform!.env.DB.batch([
			event
				.platform!.env.DB.prepare('UPDATE menu_categories SET position=? WHERE id=?')
				.bind(rows.results[j].position, id),
			event
				.platform!.env.DB.prepare('UPDATE menu_categories SET position=? WHERE id=?')
				.bind(rows.results[i].position, rows.results[j].id),
		]);
		await revise(event.platform!.env.DB);
	},
};
