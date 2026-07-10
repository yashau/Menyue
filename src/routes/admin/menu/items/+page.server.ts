import { error } from '@sveltejs/kit';
import { requireCapability } from '$lib/server/permissions';
import { requireCsrf } from '$lib/server/auth';
import { uploadImage } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

const restaurant = 'demo';
async function guard(e: Parameters<Actions[string]>[0]) {
	requireCapability(e.locals, 'menu:write');
	await requireCsrf(e);
}
const revise = (db: D1Database) =>
	db
		.prepare('UPDATE restaurants SET menu_revision=menu_revision+1 WHERE id=?')
		.bind(restaurant)
		.run();
const ownedItem = async (db: D1Database, id: string) =>
	!!(await db
		.prepare(
			'SELECT i.id FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.id=? AND c.restaurant_id=?',
		)
		.bind(id, restaurant)
		.first());
const ownedCategory = async (db: D1Database, id: string) =>
	!!(await db
		.prepare('SELECT id FROM menu_categories WHERE id=? AND restaurant_id=? AND archived=0')
		.bind(id, restaurant)
		.first());
const ownedGroup = async (db: D1Database, id: string) =>
	!!(await db
		.prepare(
			'SELECT g.id FROM combo_groups g JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE g.id=? AND c.restaurant_id=?',
		)
		.bind(id, restaurant)
		.first());
const swap = async (
	db: D1Database,
	table: string,
	id: string,
	parent: string,
	parentId: string,
	direction: string,
) => {
	const rows = await db
			.prepare(`SELECT id,position FROM ${table} WHERE ${parent}=? ORDER BY position,id`)
			.bind(parentId)
			.all<{ id: string; position: number }>(),
		i = rows.results.findIndex((x) => x.id === id),
		j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= rows.results.length) throw error(400);
	const ordered = [...rows.results];
	[ordered[i], ordered[j]] = [ordered[j], ordered[i]];
	await db.batch(
		ordered.map((row, position) =>
			db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).bind(position, row.id),
		),
	);
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'menu:write');
	const db = platform!.env.DB;
	return {
		categories: (
			await db
				.prepare('SELECT id,name FROM menu_categories WHERE restaurant_id=? AND archived=0')
				.bind(restaurant)
				.all()
		).results,
		allergens: (await db.prepare('SELECT id,name FROM allergens ORDER BY name').all()).results,
		items: (
			await db
				.prepare(
					'SELECT i.*,c.name category FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? ORDER BY i.position',
				)
				.bind(restaurant)
				.all()
		).results,
		promotions: (
			await db
				.prepare(
					'SELECT p.* FROM item_promotions p JOIN menu_items i ON i.id=p.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=?',
				)
				.bind(restaurant)
				.all()
		).results,
		groups: (
			await db
				.prepare(
					'SELECT g.* FROM combo_groups g JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=?',
				)
				.bind(restaurant)
				.all()
		).results,
		choices: (
			await db
				.prepare(
					'SELECT ch.* FROM combo_choices ch JOIN combo_groups g ON g.id=ch.group_id JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=?',
				)
				.bind(restaurant)
				.all()
		).results,
		links: (
			await db
				.prepare(
					'SELECT ia.* FROM item_allergens ia JOIN menu_items i ON i.id=ia.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=?',
				)
				.bind(restaurant)
				.all()
		).results,
	};
};

export const actions: Actions = {
	save: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('id') || crypto.randomUUID()),
			category = String(f.get('category')),
			photo = f.get('photo');
		let asset: string | null = null;
		if (!(await ownedCategory(e.platform!.env.DB, category))) throw error(400, 'Invalid category');
		if (photo instanceof File && photo.size)
			asset = await uploadImage(e.platform!.env.DB, e.platform!.env.MEDIA, photo);
		if (f.get('id') && !(await ownedItem(e.platform!.env.DB, id))) throw error(404);
		if (f.get('id'))
			await e
				.platform!.env.DB.prepare(
					'UPDATE menu_items SET category_id=?,code=?,name=?,description=?,base_price_minor=?,allergy_note=?,photo_asset_id=COALESCE(?,photo_asset_id),enabled=? WHERE id=?',
				)
				.bind(
					category,
					String(f.get('code')),
					String(f.get('name')),
					String(f.get('description')),
					Math.round(Number(f.get('price')) * 100),
					String(f.get('allergy')),
					asset,
					f.get('enabled') === 'on' ? 1 : 0,
					id,
				)
				.run();
		else
			await e
				.platform!.env.DB.prepare(
					'INSERT INTO menu_items(id,category_id,code,name,description,base_price_minor,allergy_note,photo_asset_id,position,enabled) VALUES(?,?,?,?,?,?,?,?,0,1)',
				)
				.bind(
					id,
					category,
					String(f.get('code')),
					String(f.get('name')),
					String(f.get('description')),
					Math.round(Number(f.get('price')) * 100),
					String(f.get('allergy')),
					asset,
				)
				.run();
		await e.platform!.env.DB.prepare('DELETE FROM item_allergens WHERE item_id=?').bind(id).run();
		for (const a of f.getAll('allergen'))
			await e
				.platform!.env.DB.prepare(
					"INSERT INTO item_allergens(item_id,allergen_id,severity) VALUES(?,?, 'contains')",
				)
				.bind(id, String(a))
				.run();
		await revise(e.platform!.env.DB);
	},
	archive: async (e) => {
		await guard(e);
		const id = String((await e.request.formData()).get('id'));
		if (!(await ownedItem(e.platform!.env.DB, id))) throw error(404);
		await e.platform!.env.DB.prepare('UPDATE menu_items SET archived=1 WHERE id=?').bind(id).run();
		await revise(e.platform!.env.DB);
	},
	move: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('itemId')),
			d = String(f.get('direction'));
		if (!(await ownedItem(e.platform!.env.DB, id)) || !['up', 'down'].includes(d)) throw error(400);
		const item = await e
			.platform!.env.DB.prepare('SELECT category_id FROM menu_items WHERE id=?')
			.bind(id)
			.first<{ category_id: string }>();
		await swap(e.platform!.env.DB, 'menu_items', id, 'category_id', item!.category_id, d);
		await revise(e.platform!.env.DB);
	},
	promotion: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			item = String(f.get('item'));
		if (!(await ownedItem(e.platform!.env.DB, item))) throw error(404);
		await e
			.platform!.env.DB.prepare('DELETE FROM item_promotions WHERE item_id=?')
			.bind(item)
			.run();
		if (f.get('clear') !== 'on')
			await e
				.platform!.env.DB.prepare(
					'INSERT INTO item_promotions(id,item_id,label,description,price_minor,starts_at,ends_at,enabled) VALUES(?,?,?,?,?,?,?,?)',
				)
				.bind(
					crypto.randomUUID(),
					item,
					String(f.get('label')),
					String(f.get('description')),
					f.get('price') ? Math.round(Number(f.get('price')) * 100) : null,
					String(f.get('start')) || null,
					String(f.get('end')) || null,
					f.get('enabled') === 'on' ? 1 : 0,
				)
				.run();
		await revise(e.platform!.env.DB);
	},
	group: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			item = String(f.get('item')),
			min = Number(f.get('min')),
			max = Number(f.get('max'));
		if (!(await ownedItem(e.platform!.env.DB, item)) || min < 0 || max < min) throw error(400);
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO combo_groups(id,item_id,name,min_choices,max_choices,enabled) VALUES(?,?,?,?,?,?)',
			)
			.bind(
				crypto.randomUUID(),
				item,
				String(f.get('name')),
				min,
				max,
				f.get('enabled') === 'on' ? 1 : 0,
			)
			.run();
		await revise(e.platform!.env.DB);
	},
	groupEdit: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			min = Number(f.get('min')),
			max = Number(f.get('max'));
		if (!(await ownedGroup(e.platform!.env.DB, id)) || min < 0 || max < min) throw error(400);
		await e
			.platform!.env.DB.prepare(
				'UPDATE combo_groups SET name=?,min_choices=?,max_choices=?,enabled=? WHERE id=?',
			)
			.bind(String(f.get('name')), min, max, f.get('enabled') === 'on' ? 1 : 0, id)
			.run();
		await revise(e.platform!.env.DB);
	},
	groupDelete: async (e) => {
		await guard(e);
		const id = String((await e.request.formData()).get('id'));
		if (!(await ownedGroup(e.platform!.env.DB, id))) throw error(404);
		await e.platform!.env.DB.batch([
			e.platform!.env.DB.prepare('DELETE FROM combo_choices WHERE group_id=?').bind(id),
			e.platform!.env.DB.prepare('DELETE FROM combo_groups WHERE id=?').bind(id),
		]);
		await revise(e.platform!.env.DB);
	},
	groupMove: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			d = String(f.get('direction'));
		if (!(await ownedGroup(e.platform!.env.DB, id)) || !['up', 'down'].includes(d))
			throw error(400);
		const g = await e
			.platform!.env.DB.prepare('SELECT item_id FROM combo_groups WHERE id=?')
			.bind(id)
			.first<{ item_id: string }>();
		await swap(e.platform!.env.DB, 'combo_groups', id, 'item_id', g!.item_id, d);
		await revise(e.platform!.env.DB);
	},
	choice: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			group = String(f.get('group')),
			delta = Math.round(Number(f.get('delta')) * 100);
		if (!(await ownedGroup(e.platform!.env.DB, group)) || !Number.isFinite(delta)) throw error(400);
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO combo_choices(id,group_id,code,name,price_delta_minor,enabled) VALUES(?,?,?,?,?,?)',
			)
			.bind(
				crypto.randomUUID(),
				group,
				String(f.get('code')),
				String(f.get('name')),
				delta,
				f.get('enabled') === 'on' ? 1 : 0,
			)
			.run();
		await revise(e.platform!.env.DB);
	},
	choiceEdit: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			delta = Math.round(Number(f.get('delta')) * 100),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (!r || !(await ownedGroup(e.platform!.env.DB, r.group_id)) || !Number.isFinite(delta))
			throw error(400);
		await e
			.platform!.env.DB.prepare(
				'UPDATE combo_choices SET code=?,name=?,price_delta_minor=?,enabled=? WHERE id=?',
			)
			.bind(
				String(f.get('code')),
				String(f.get('name')),
				delta,
				f.get('enabled') === 'on' ? 1 : 0,
				id,
			)
			.run();
		await revise(e.platform!.env.DB);
	},
	choiceDelete: async (e) => {
		await guard(e);
		const id = String((await e.request.formData()).get('id')),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (!r || !(await ownedGroup(e.platform!.env.DB, r.group_id))) throw error(404);
		await e.platform!.env.DB.prepare('DELETE FROM combo_choices WHERE id=?').bind(id).run();
		await revise(e.platform!.env.DB);
	},
	choiceMove: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			d = String(f.get('direction')),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (!r || !(await ownedGroup(e.platform!.env.DB, r.group_id)) || !['up', 'down'].includes(d))
			throw error(400);
		await swap(e.platform!.env.DB, 'combo_choices', id, 'group_id', r.group_id, d);
		await revise(e.platform!.env.DB);
	},
};
