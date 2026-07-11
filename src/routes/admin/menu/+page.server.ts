import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { assertCsrf, requireMenuEditor } from '$lib/server/auth';
import { getCategories, getMenuItems } from '$lib/server/menu';
import { getRestaurant } from '$lib/server/currency';
import { majorToMinor } from '$lib/money';

async function audit(
	db: import('@cloudflare/workers-types').D1Database,
	rid: number,
	actor: string,
	action: string,
	entity: string,
	id: number | null,
	detail: unknown
) {
	await db
		.prepare(
			`INSERT INTO audit_log (restaurant_id, actor, action, entity_type, entity_id, detail, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
		)
		.bind(rid, actor, action, entity, id, JSON.stringify(detail))
		.run();
}

function csvToJson(value: string): string {
	const arr = value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return JSON.stringify(arr);
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const db = getDB(platform);
	const rid = locals.restaurantId;
	const [items, categories, restaurant, suggestions] = await Promise.all([
		getMenuItems(db, rid, { includeDisabled: true }),
		getCategories(db, rid, { includeDisabled: true }),
		getRestaurant(db, rid),
		db
			.prepare(
				`SELECT s.id, s.source_item_id, s.target_item_id, s.enabled, s.display_order, t.name AS target_name
				 FROM suggestions s JOIN items t ON t.id = s.target_item_id
				 WHERE s.restaurant_id = ? ORDER BY s.source_item_id, s.display_order`
			)
			.bind(rid)
			.all<{ id: number; source_item_id: number; target_item_id: number; enabled: number; display_order: number; target_name: string }>()
	]);
	return {
		items,
		categories,
		basePrecision: restaurant.base.precision,
		base: restaurant.base,
		suggestions: suggestions.results,
		q: url.searchParams.get('q') ?? ''
	};
};

export const actions: Actions = {
	save: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const restaurant = await getRestaurant(db, user.restaurantId);
		const precision = restaurant.base.precision;

		const id = form.get('id') ? Number(form.get('id')) : null;
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });
		const description = String(form.get('description') ?? '').trim() || null;
		const priceMajor = parseFloat(String(form.get('price') ?? '0')) || 0;
		const basePrice = majorToMinor(priceMajor, precision);
		const categoryId = form.get('categoryId') ? Number(form.get('categoryId')) : null;
		const availability = form.get('availability') === 'unavailable' ? 'unavailable' : 'available';
		const enabled = form.get('enabled') === 'on' ? 1 : 0;
		const listed = form.get('listed') === 'on' ? 1 : 0;
		const isBeverage = form.get('isBeverage') === 'on' ? 1 : 0;
		const allergens = csvToJson(String(form.get('allergens') ?? ''));
		const dietary = csvToJson(String(form.get('dietary') ?? ''));
		const tags = csvToJson(String(form.get('tags') ?? ''));
		const label = String(form.get('label') ?? '').trim() || null;
		const labelKind = ['info', 'promo', 'new'].includes(String(form.get('labelKind')))
			? String(form.get('labelKind'))
			: 'info';
		const imageKey = String(form.get('imageKey') ?? '').trim() || null;
		const imageSeed = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'dish';

		if (id) {
			await db
				.prepare(
					`UPDATE items SET name=?, description=?, base_price=?, category_id=?, availability=?, enabled=?, listed=?, is_beverage=?, allergens=?, dietary=?, tags=?, label=?, label_kind=?, image_key=?, updated_at=unixepoch()
					 WHERE id=? AND restaurant_id=?`
				)
				.bind(name, description, basePrice, categoryId, availability, enabled, listed, isBeverage, allergens, dietary, tags, label, labelKind, imageKey, id, user.restaurantId)
				.run();
			await audit(db, user.restaurantId, user.username, 'item.update', 'item', id, { name });
			return { saved: true };
		} else {
			const row = await db
				.prepare(
					`INSERT INTO items (restaurant_id, name, description, base_price, image_seed, image_key, category_id, availability, enabled, listed, is_beverage, allergens, dietary, tags, label, label_kind, display_order, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 999, unixepoch(), unixepoch()) RETURNING id`
				)
				.bind(user.restaurantId, name, description, basePrice, imageSeed, imageKey, categoryId, availability, enabled, listed, isBeverage, allergens, dietary, tags, label, labelKind)
				.first<{ id: number }>();
			await audit(db, user.restaurantId, user.username, 'item.create', 'item', row?.id ?? null, { name });
			return { saved: true, createdId: row?.id };
		}
	},

	toggleEnabled: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		const value = form.get('value') === '1' ? 1 : 0;
		await db.prepare('UPDATE items SET enabled=?, updated_at=unixepoch() WHERE id=? AND restaurant_id=?').bind(value, id, user.restaurantId).run();
		await audit(db, user.restaurantId, user.username, 'item.enabled', 'item', id, { enabled: value });
		return { saved: true };
	},

	toggleAvailability: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		const value = form.get('value') === 'unavailable' ? 'unavailable' : 'available';
		await db.prepare('UPDATE items SET availability=?, updated_at=unixepoch() WHERE id=? AND restaurant_id=?').bind(value, id, user.restaurantId).run();
		await audit(db, user.restaurantId, user.username, 'item.availability', 'item', id, { availability: value });
		return { saved: true };
	},

	remove: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		await db.prepare('DELETE FROM items WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId).run();
		await audit(db, user.restaurantId, user.username, 'item.delete', 'item', id, {});
		return { saved: true };
	},

	addSuggestion: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const source = Number(form.get('sourceId'));
		const target = Number(form.get('targetId'));
		if (source === target) return fail(400, { error: 'An item cannot suggest itself' });
		try {
			await db
				.prepare(
					`INSERT INTO suggestions (restaurant_id, source_item_id, target_item_id, display_order, enabled, created_at)
					 VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order),0)+1 FROM suggestions WHERE restaurant_id=? AND source_item_id=?), 1, unixepoch())`
				)
				.bind(user.restaurantId, source, target, user.restaurantId, source)
				.run();
		} catch {
			return fail(400, { error: 'That suggestion already exists' });
		}
		await audit(db, user.restaurantId, user.username, 'suggestion.add', 'item', source, { target });
		return { saved: true };
	},

	removeSuggestion: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('suggestionId'));
		await db.prepare('DELETE FROM suggestions WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId).run();
		await audit(db, user.restaurantId, user.username, 'suggestion.remove', 'suggestion', id, {});
		return { saved: true };
	},

	// Persist the whole menu tree in one shot: category order + each item's
	// category and position. Sent by the drag-and-drop board on every drop.
	reorder: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		let tree: { categoryId: number | null; itemIds: number[] }[];
		try {
			tree = JSON.parse(String(form.get('structure') ?? '[]'));
			if (!Array.isArray(tree)) throw new Error('not an array');
		} catch {
			return fail(400, { error: 'Bad reorder payload' });
		}
		const stmts = [];
		let catOrder = 0;
		for (const group of tree) {
			if (group.categoryId != null) {
				stmts.push(
					db
						.prepare('UPDATE categories SET display_order=? WHERE id=? AND restaurant_id=?')
						.bind(catOrder, group.categoryId, user.restaurantId)
				);
				catOrder++;
			}
			(group.itemIds ?? []).forEach((itemId, ii) => {
				stmts.push(
					db
						.prepare('UPDATE items SET category_id=?, display_order=?, updated_at=unixepoch() WHERE id=? AND restaurant_id=?')
						.bind(group.categoryId, ii, Number(itemId), user.restaurantId)
				);
			});
		}
		if (stmts.length) await db.batch(stmts);
		return { saved: true };
	},

	saveCategory: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = form.get('id') ? Number(form.get('id')) : null;
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name required' });
		const description = String(form.get('description') ?? '').trim() || null;
		const enabled = form.get('enabled') === 'on' ? 1 : 0;
		if (id) {
			await db
				.prepare('UPDATE categories SET name=?, description=?, enabled=? WHERE id=? AND restaurant_id=?')
				.bind(name, description, enabled, id, user.restaurantId)
				.run();
		} else {
			await db
				.prepare(
					`INSERT INTO categories (restaurant_id, name, description, enabled, display_order, created_at)
					 VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(display_order),0)+1 FROM categories WHERE restaurant_id=?), unixepoch())`
				)
				.bind(user.restaurantId, name, description, enabled, user.restaurantId)
				.run();
		}
		return { saved: true };
	},

	removeCategory: async ({ request, locals, platform }) => {
		const user = requireMenuEditor(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		// Items in the category are kept but become uncategorised (not deleted).
		await db.batch([
			db.prepare('UPDATE items SET category_id=NULL WHERE category_id=? AND restaurant_id=?').bind(id, user.restaurantId),
			db.prepare('DELETE FROM categories WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId)
		]);
		return { saved: true };
	}
};
