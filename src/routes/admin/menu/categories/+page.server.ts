import { error } from '@sveltejs/kit';
import { requireCapability } from '$lib/server/permissions';
import { requireCsrf } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';
import { restaurantId } from '$lib/server/restaurant';
import { audit } from '$lib/server/audit';
import { moveInCanonicalOrder } from '$lib/admin-menu';
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'menu:write');
	const result = await platform!.env.DB.prepare(
		`SELECT c.id,c.code,c.name,c.description,c.enabled,c.position,COUNT(i.id) AS item_count
		FROM menu_categories c
		LEFT JOIN menu_items i ON i.category_id=c.id AND i.archived=0
		WHERE c.restaurant_id=? AND c.archived=0
		GROUP BY c.id,c.code,c.name,c.description,c.enabled,c.position
		ORDER BY c.position`,
	)
		.bind(restaurantId(platform!.env))
		.all();
	return { categories: result.results };
};
const revise = async (db: D1Database, restaurant: string) =>
	db.prepare('UPDATE restaurants SET menu_revision=menu_revision+1 WHERE id=?').bind(restaurant).run();
export const actions: Actions = {
	create: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const form = await event.request.formData(),
			name = String(form.get('name') ?? '').trim(),
			description = String(form.get('description') ?? '').trim();
		if (!name) return error(400, 'Name is required');
		const id = crypto.randomUUID();
		const restaurant = restaurantId(event.platform!.env);
		await event
			.platform!.env.DB.prepare(
				'INSERT INTO menu_categories(id,restaurant_id,code,name,description,position) VALUES(?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM menu_categories WHERE restaurant_id=?),0))',
			)
			.bind(
				id,
				restaurant,
				name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
				name,
				description,
				restaurant,
			)
			.run();
		await revise(event.platform!.env.DB, restaurant);
		await audit(event.platform!.env.DB, event.locals.user!.id, 'menu.category.created', 'category', id, { name });
	},
	update: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const f = await event.request.formData(),
			id = String(f.get('id'));
		const restaurant = restaurantId(event.platform!.env);
		const r = await event
			.platform!.env.DB.prepare(
				'UPDATE menu_categories SET name=?,description=?,enabled=?,version=version+1 WHERE id=? AND restaurant_id=? AND archived=0',
			)
			.bind(
				String(f.get('name') ?? ''),
				String(f.get('description') ?? ''),
				f.get('enabled') === 'on' ? 1 : 0,
				id,
				restaurant,
			)
			.run();
		if (!r.meta.changes) throw error(404);
		await revise(event.platform!.env.DB, restaurant);
		await audit(event.platform!.env.DB, event.locals.user!.id, 'menu.category.updated', 'category', id);
	},
	archive: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const id = String((await event.request.formData()).get('id'));
		const restaurant = restaurantId(event.platform!.env);
		const result = await event
			.platform!.env.DB.prepare(
				'UPDATE menu_categories SET archived=1,version=version+1 WHERE id=? AND restaurant_id=? AND archived=0',
			)
			.bind(id, restaurant)
			.run();
		if (!result.meta.changes) throw error(404);
		await revise(event.platform!.env.DB, restaurant);
		await audit(event.platform!.env.DB, event.locals.user!.id, 'menu.category.archived', 'category', id);
	},
	move: async (event) => {
		requireCapability(event.locals, 'menu:write');
		await requireCsrf(event);
		const f = await event.request.formData(),
			id = String(f.get('id')),
			direction = String(f.get('direction'));
		const restaurant = restaurantId(event.platform!.env);
		const rows = await event
			.platform!.env.DB.prepare(
				'SELECT id,position FROM menu_categories WHERE restaurant_id=? AND archived=0 ORDER BY position',
			)
			.bind(restaurant)
			.all<{ id: string; position: number }>();
		if (!['up', 'down'].includes(direction)) throw error(400);
		let ordered: { id: string; position: number }[];
		try {
			ordered = moveInCanonicalOrder(rows.results, id, direction as 'up' | 'down');
		} catch {
			throw error(400, 'This category cannot move any further.');
		}
		await event.platform!.env.DB.batch(
			ordered.map((category, position) =>
				event.platform!.env.DB.prepare('UPDATE menu_categories SET position=? WHERE id=? AND restaurant_id=?').bind(position, category.id, restaurant),
			),
		);
		await revise(event.platform!.env.DB, restaurant);
		await audit(event.platform!.env.DB, event.locals.user!.id, 'menu.category.moved', 'category', id, { direction });
	},
};
