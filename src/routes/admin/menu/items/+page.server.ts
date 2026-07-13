import { error } from '@sveltejs/kit';
import { requireCapability } from '$lib/server/permissions';
import { requireCsrf } from '$lib/server/auth';
import { uploadImage } from '$lib/server/media';
import { restaurantId } from '$lib/server/restaurant';
import { audit } from '$lib/server/audit';
import { parsePromotionMinor } from '$lib/server/promotion-price';
import { csvMetadata, moveInCanonicalOrder } from '$lib/admin-menu';
import { isSafeCustomerMenuImageUrl } from '$lib/customer-menu';
import type { Actions, PageServerLoad } from './$types';
async function guard(e: Parameters<Actions[string]>[0]) {
	requireCapability(e.locals, 'menu:write');
	await requireCsrf(e);
}
const revise = async (
	db: D1Database,
	restaurant: string,
	actorId: string,
	action: string,
	targetType: string,
	targetId: string,
	detail: Record<string, unknown> = {},
) => {
	await db
		.prepare('UPDATE restaurants SET menu_revision=menu_revision+1 WHERE id=?')
		.bind(restaurant)
		.run();
	await audit(db, actorId, action, targetType, targetId, detail);
};
const ownedItem = async (db: D1Database, restaurant: string, id: string) =>
	!!(await db
		.prepare(
			'SELECT i.id FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.id=? AND c.restaurant_id=? AND i.archived=0 AND c.archived=0',
		)
		.bind(id, restaurant)
		.first());
const availableItem = async (db: D1Database, restaurant: string, id: string) =>
	!!(await db
		.prepare(
			"SELECT i.id FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.id=? AND c.restaurant_id=? AND i.archived=0 AND c.archived=0 AND c.enabled=1 AND i.enabled=1 AND i.availability='available'",
		)
		.bind(id, restaurant)
		.first());
const ownedCategory = async (db: D1Database, restaurant: string, id: string) =>
	!!(await db
		.prepare('SELECT id FROM menu_categories WHERE id=? AND restaurant_id=? AND archived=0')
		.bind(id, restaurant)
		.first());
const ownedGroup = async (db: D1Database, restaurant: string, id: string) =>
	!!(await db
		.prepare(
			'SELECT g.id FROM combo_groups g JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE g.id=? AND c.restaurant_id=?',
		)
		.bind(id, restaurant)
		.first());
const moveWithinParent = async (
	db: D1Database,
	table: string,
	id: string,
	parent: string,
	parentId: string,
	direction: 'up' | 'down',
	activeOnly = false,
) => {
	const rows = await db
		.prepare(
			`SELECT id,position FROM ${table} WHERE ${parent}=?${activeOnly ? ' AND archived=0' : ''} ORDER BY position,id`,
		)
		.bind(parentId)
		.all<{ id: string; position: number }>();
	let ordered: { id: string; position: number }[];
	try {
		ordered = moveInCanonicalOrder(rows.results, id, direction);
	} catch {
		throw error(400, 'This item cannot move any further.');
	}
	await db.batch(
		ordered.map((row, position) =>
			db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).bind(position, row.id),
		),
	);
};

const canonicalizeSuggestionPositions = async (
	db: D1Database,
	restaurant: string,
	itemId: string,
	suggestedItemId: string,
	requestedPosition: number,
) => {
	const siblings = await db
		.prepare(
			'SELECT suggested_item_id FROM item_suggestions WHERE restaurant_id=? AND item_id=? AND suggested_item_id<>? ORDER BY position,suggested_item_id',
		)
		.bind(restaurant, itemId, suggestedItemId)
		.all<{ suggested_item_id: string }>();
	const ordered = siblings.results.map((row) => row.suggested_item_id);
	ordered.splice(Math.min(requestedPosition, ordered.length), 0, suggestedItemId);
	await db.batch(
		ordered.map((id, position) =>
			db
				.prepare(
					'UPDATE item_suggestions SET position=? WHERE restaurant_id=? AND item_id=? AND suggested_item_id=?',
				)
				.bind(position, restaurant, itemId, id),
		),
	);
};
const normalizeSuggestionPositions = async (db: D1Database, restaurant: string, itemId: string) => {
	const siblings = await db
		.prepare(
			'SELECT suggested_item_id FROM item_suggestions WHERE restaurant_id=? AND item_id=? ORDER BY position,suggested_item_id',
		)
		.bind(restaurant, itemId)
		.all<{ suggested_item_id: string }>();
	await db.batch(
		siblings.results.map((row, position) =>
			db
				.prepare(
					'UPDATE item_suggestions SET position=? WHERE restaurant_id=? AND item_id=? AND suggested_item_id=?',
				)
				.bind(position, restaurant, itemId, row.suggested_item_id),
		),
	);
};
const normalizeWithinParent = async (
	db: D1Database,
	table: string,
	parent: string,
	parentId: string,
) => {
	const rows = await db
		.prepare(`SELECT id FROM ${table} WHERE ${parent}=? AND archived=0 ORDER BY position,id`)
		.bind(parentId)
		.all<{ id: string }>();
	await db.batch(
		rows.results.map((row, position) =>
			db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).bind(position, row.id),
		),
	);
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCapability(locals, 'menu:write');
	const db = platform!.env.DB;
	const restaurant = restaurantId(platform!.env);
	return {
		categories: (
			await db
				.prepare(
					'SELECT id,name FROM menu_categories WHERE restaurant_id=? AND archived=0 ORDER BY position,id',
				)
				.bind(restaurant)
				.all()
		).results,
		allergens: (await db.prepare('SELECT id,name FROM allergens ORDER BY name').all()).results,
		items: (
			await db
				.prepare(
					'SELECT i.*,c.name category,c.position AS category_position FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0 ORDER BY c.position,i.position,i.id',
				)
				.bind(restaurant)
				.all()
		).results,
		promotions: (
			await db
				.prepare(
					'SELECT p.* FROM item_promotions p JOIN menu_items i ON i.id=p.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0',
				)
				.bind(restaurant)
				.all()
		).results,
		groups: (
			await db
				.prepare(
					'SELECT g.* FROM combo_groups g JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0',
				)
				.bind(restaurant)
				.all()
		).results,
		choices: (
			await db
				.prepare(
					'SELECT ch.* FROM combo_choices ch JOIN combo_groups g ON g.id=ch.group_id JOIN menu_items i ON i.id=g.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0',
				)
				.bind(restaurant)
				.all()
		).results,
		links: (
			await db
				.prepare(
					'SELECT ia.* FROM item_allergens ia JOIN menu_items i ON i.id=ia.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0',
				)
				.bind(restaurant)
				.all()
		).results,
		suggestions: (
			await db
				.prepare(
					'SELECT * FROM item_suggestions WHERE restaurant_id=? ORDER BY item_id,position,suggested_item_id',
				)
				.bind(restaurant)
				.all()
		).results,
	};
};

export const actions: Actions = {
	save: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id') || crypto.randomUUID()),
			category = String(f.get('category')),
			photo = f.get('photo');
		const availability = String(f.get('availability') || 'available');
		const discoverability = String(f.get('discoverability') || 'browse');
		const price = Math.round(Number(f.get('price')) * 100);
		const imageUrl = String(f.get('imageUrl') || '').trim();
		const name = String(f.get('name') || '').trim();
		if (
			!['available', 'sold_out'].includes(availability) ||
			!['browse', 'suggestion_only'].includes(discoverability)
		)
			throw error(400, 'Invalid availability or discovery setting.');
		if (!name || !Number.isSafeInteger(price) || price < 0)
			throw error(400, 'Provide an item name and valid non-negative price.');
		if (imageUrl && !isSafeCustomerMenuImageUrl(imageUrl))
			throw error(400, 'Image path must point to a local /menu/ image.');
		let asset: string | null = null;
		if (!(await ownedCategory(e.platform!.env.DB, restaurant, category)))
			throw error(400, 'Invalid category');
		if (photo instanceof File && photo.size)
			asset = await uploadImage(e.platform!.env.DB, e.platform!.env.MEDIA, photo, restaurant);
		const existing = f.get('id')
			? await e
					.platform!.env.DB.prepare('SELECT category_id FROM menu_items WHERE id=?')
					.bind(id)
					.first<{ category_id: string }>()
			: null;
		if (f.get('id') && (!(await ownedItem(e.platform!.env.DB, restaurant, id)) || !existing))
			throw error(404);
		if (existing)
			await e
				.platform!.env.DB.prepare(
					'UPDATE menu_items SET category_id=?,code=?,name=?,description=?,base_price_minor=?,allergy_note=?,photo_asset_id=COALESCE(?,photo_asset_id),image_url=?,dietary_labels=?,tags=?,enabled=?,availability=?,discoverability=? WHERE id=?',
				)
				.bind(
					category,
					String(f.get('code')),
					name,
					String(f.get('description')),
					price,
					String(f.get('allergy')),
					asset,
					imageUrl || null,
					csvMetadata(f.get('dietaryLabels')),
					csvMetadata(f.get('tags')),
					f.get('enabled') === 'on' ? 1 : 0,
					availability,
					discoverability,
					id,
				)
				.run();
		else
			await e
				.platform!.env.DB.prepare(
					'INSERT INTO menu_items(id,category_id,code,name,description,base_price_minor,allergy_note,photo_asset_id,image_url,dietary_labels,tags,position,enabled,availability,discoverability) VALUES(?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM menu_items WHERE category_id=? AND archived=0),0),?,?,?)',
				)
				.bind(
					id,
					category,
					String(f.get('code')),
					name,
					String(f.get('description')),
					price,
					String(f.get('allergy')),
					asset,
					imageUrl || null,
					csvMetadata(f.get('dietaryLabels')),
					csvMetadata(f.get('tags')),
					category,
					f.get('enabled') === 'on' ? 1 : 0,
					availability,
					discoverability,
				)
				.run();
		if (existing && existing.category_id !== category)
			await Promise.all([
				normalizeWithinParent(
					e.platform!.env.DB,
					'menu_items',
					'category_id',
					existing.category_id,
				),
				normalizeWithinParent(e.platform!.env.DB, 'menu_items', 'category_id', category),
			]);
		if (!existing)
			await normalizeWithinParent(e.platform!.env.DB, 'menu_items', 'category_id', category);
		await e.platform!.env.DB.prepare('DELETE FROM item_allergens WHERE item_id=?').bind(id).run();
		for (const a of f.getAll('allergen'))
			await e
				.platform!.env.DB.prepare(
					"INSERT INTO item_allergens(item_id,allergen_id,severity) VALUES(?,?, 'contains')",
				)
				.bind(id, String(a))
				.run();
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			f.get('id') ? 'menu.item.updated' : 'menu.item.created',
			'item',
			id,
			{ uploaded: asset !== null },
		);
	},
	availability: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			availability = String(f.get('availability'));
		if (
			!['available', 'sold_out'].includes(availability) ||
			!(await ownedItem(e.platform!.env.DB, restaurant, id))
		)
			throw error(404);
		await e
			.platform!.env.DB.prepare('UPDATE menu_items SET availability=? WHERE id=?')
			.bind(availability, id)
			.run();
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.item.availability.updated',
			'item',
			id,
			{ availability },
		);
	},
	archive: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const id = String((await e.request.formData()).get('id'));
		const item = await e
			.platform!.env.DB.prepare('SELECT category_id FROM menu_items WHERE id=?')
			.bind(id)
			.first<{ category_id: string }>();
		if (!(await ownedItem(e.platform!.env.DB, restaurant, id)) || !item) throw error(404);
		await e.platform!.env.DB.prepare('UPDATE menu_items SET archived=1 WHERE id=?').bind(id).run();
		await normalizeWithinParent(e.platform!.env.DB, 'menu_items', 'category_id', item.category_id);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.item.archived',
			'item',
			id,
		);
	},
	move: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('itemId')),
			d = String(f.get('direction'));
		if (!(await ownedItem(e.platform!.env.DB, restaurant, id)) || !['up', 'down'].includes(d))
			throw error(400);
		const item = await e
			.platform!.env.DB.prepare('SELECT category_id FROM menu_items WHERE id=?')
			.bind(id)
			.first<{ category_id: string }>();
		await moveWithinParent(
			e.platform!.env.DB,
			'menu_items',
			id,
			'category_id',
			item!.category_id,
			d as 'up' | 'down',
			true,
		);
		await revise(e.platform!.env.DB, restaurant, e.locals.user!.id, 'menu.item.moved', 'item', id, {
			direction: d,
		});
	},
	promotion: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			item = String(f.get('item'));
		if (!(await ownedItem(e.platform!.env.DB, restaurant, item))) throw error(404);
		let priceMinor: number | null;
		try {
			priceMinor = parsePromotionMinor(f.get('price'));
		} catch (cause) {
			throw error(400, cause instanceof Error ? cause.message : 'Invalid promotion price.');
		}
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
					priceMinor,
					String(f.get('start')) || null,
					String(f.get('end')) || null,
					f.get('enabled') === 'on' ? 1 : 0,
				)
				.run();
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			f.get('clear') === 'on' ? 'menu.promotion.removed' : 'menu.promotion.saved',
			'item',
			item,
		);
	},
	group: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			item = String(f.get('item')),
			min = Number(f.get('min')),
			max = Number(f.get('max'));
		if (!(await ownedItem(e.platform!.env.DB, restaurant, item)) || min < 0 || max < min)
			throw error(400);
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
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_group.created',
			'item',
			item,
		);
	},
	groupEdit: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			min = Number(f.get('min')),
			max = Number(f.get('max'));
		if (!(await ownedGroup(e.platform!.env.DB, restaurant, id)) || min < 0 || max < min)
			throw error(400);
		await e
			.platform!.env.DB.prepare(
				'UPDATE combo_groups SET name=?,min_choices=?,max_choices=?,enabled=? WHERE id=?',
			)
			.bind(String(f.get('name')), min, max, f.get('enabled') === 'on' ? 1 : 0, id)
			.run();
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_group.updated',
			'modifier_group',
			id,
		);
	},
	groupDelete: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const id = String((await e.request.formData()).get('id'));
		if (!(await ownedGroup(e.platform!.env.DB, restaurant, id))) throw error(404);
		await e.platform!.env.DB.batch([
			e.platform!.env.DB.prepare('DELETE FROM combo_choices WHERE group_id=?').bind(id),
			e.platform!.env.DB.prepare('DELETE FROM combo_groups WHERE id=?').bind(id),
		]);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_group.deleted',
			'modifier_group',
			id,
		);
	},
	groupMove: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			d = String(f.get('direction'));
		if (!(await ownedGroup(e.platform!.env.DB, restaurant, id)) || !['up', 'down'].includes(d))
			throw error(400);
		const g = await e
			.platform!.env.DB.prepare('SELECT item_id FROM combo_groups WHERE id=?')
			.bind(id)
			.first<{ item_id: string }>();
		await moveWithinParent(
			e.platform!.env.DB,
			'combo_groups',
			id,
			'item_id',
			g!.item_id,
			d as 'up' | 'down',
		);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_group.moved',
			'modifier_group',
			id,
			{ direction: d },
		);
	},
	choice: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			group = String(f.get('group')),
			delta = Math.round(Number(f.get('delta')) * 100);
		if (!(await ownedGroup(e.platform!.env.DB, restaurant, group)) || !Number.isFinite(delta))
			throw error(400);
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
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_choice.created',
			'modifier_group',
			group,
		);
	},
	choiceEdit: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			delta = Math.round(Number(f.get('delta')) * 100),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (
			!r ||
			!(await ownedGroup(e.platform!.env.DB, restaurant, r.group_id)) ||
			!Number.isFinite(delta)
		)
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
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_choice.updated',
			'modifier_choice',
			id,
		);
	},
	choiceDelete: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const id = String((await e.request.formData()).get('id')),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (!r || !(await ownedGroup(e.platform!.env.DB, restaurant, r.group_id))) throw error(404);
		await e.platform!.env.DB.prepare('DELETE FROM combo_choices WHERE id=?').bind(id).run();
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_choice.deleted',
			'modifier_choice',
			id,
		);
	},
	choiceMove: async (e) => {
		await guard(e);
		const restaurant = restaurantId(e.platform!.env);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			d = String(f.get('direction')),
			r = await e
				.platform!.env.DB.prepare('SELECT group_id FROM combo_choices WHERE id=?')
				.bind(id)
				.first<{ group_id: string }>();
		if (
			!r ||
			!(await ownedGroup(e.platform!.env.DB, restaurant, r.group_id)) ||
			!['up', 'down'].includes(d)
		)
			throw error(400);
		await moveWithinParent(
			e.platform!.env.DB,
			'combo_choices',
			id,
			'group_id',
			r.group_id,
			d as 'up' | 'down',
		);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.modifier_choice.moved',
			'modifier_choice',
			id,
			{ direction: d },
		);
	},
	suggestion: async (e) => {
		await guard(e);
		const f = await e.request.formData();
		const restaurant = restaurantId(e.platform!.env);
		const item = String(f.get('item')),
			suggested = String(f.get('suggested'));
		const rawPosition = f.get('position');
		const position =
			typeof rawPosition === 'string' && rawPosition.trim() ? Number(rawPosition) : Number.NaN;
		if (
			item === suggested ||
			!(await ownedItem(e.platform!.env.DB, restaurant, item)) ||
			!(await availableItem(e.platform!.env.DB, restaurant, suggested))
		)
			throw error(400, 'Choose an available item from this restaurant.');
		if (!Number.isSafeInteger(position) || position < 0)
			throw error(400, 'Suggestion position must be a non-negative integer.');
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO item_suggestions(restaurant_id,item_id,suggested_item_id,position,enabled) VALUES(?,?,?,?,?) ON CONFLICT(item_id,suggested_item_id) DO UPDATE SET enabled=excluded.enabled,position=excluded.position,updated_at=unixepoch()',
			)
			.bind(restaurant, item, suggested, position, f.get('enabled') === 'on' ? 1 : 0)
			.run();
		await canonicalizeSuggestionPositions(
			e.platform!.env.DB,
			restaurant,
			item,
			suggested,
			position,
		);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.suggestion.saved',
			'item',
			item,
			{ suggested },
		);
	},
	suggestionDelete: async (e) => {
		await guard(e);
		const f = await e.request.formData(),
			item = String(f.get('item')),
			suggested = String(f.get('suggested'));
		const restaurant = restaurantId(e.platform!.env);
		if (
			!(await ownedItem(e.platform!.env.DB, restaurant, item)) ||
			!(await ownedItem(e.platform!.env.DB, restaurant, suggested))
		)
			throw error(404);
		await e
			.platform!.env.DB.prepare(
				'DELETE FROM item_suggestions WHERE restaurant_id=? AND item_id=? AND suggested_item_id=?',
			)
			.bind(restaurant, item, suggested)
			.run();
		await normalizeSuggestionPositions(e.platform!.env.DB, restaurant, item);
		await revise(
			e.platform!.env.DB,
			restaurant,
			e.locals.user!.id,
			'menu.suggestion.deleted',
			'item',
			item,
			{ suggested },
		);
	},
};
