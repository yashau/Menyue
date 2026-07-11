import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { assertCsrf, requireAdmin } from '$lib/server/auth';
import { getRestaurant, getDisplayCurrencies, resolveRates, refreshRates, FRESH_WINDOW_SECONDS, MAX_GOOD_WINDOW_SECONDS } from '$lib/server/currency';
import { getCategories } from '$lib/server/menu';

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals.user); // managers get a genuine 403
	const db = getDB(platform);
	const rid = locals.restaurantId;
	const restaurant = await getRestaurant(db, rid);
	const currencies = await getDisplayCurrencies(db, rid, true);
	const rateMap = await resolveRates(db, restaurant, currencies.filter((c) => c.enabled));
	const categories = await getCategories(db, rid, { includeDisabled: true });
	const bevItems = await db.prepare('SELECT b.item_id, i.name FROM beverage_prompt_items b JOIN items i ON i.id=b.item_id WHERE b.restaurant_id=? ORDER BY b.display_order').bind(rid).all<{ item_id: number; name: string }>();
	const bevCats = await db.prepare('SELECT category_id FROM beverage_prompt_categories WHERE restaurant_id=?').bind(rid).all<{ category_id: number }>();
	const drinkItems = await db.prepare("SELECT id, name FROM items WHERE restaurant_id=? AND enabled=1 ORDER BY name").bind(rid).all<{ id: number; name: string }>();

	return {
		restaurant,
		currencies,
		rates: [...rateMap.values()],
		categories,
		beverageItems: bevItems.results,
		beverageCategoryIds: bevCats.results.map((r) => r.category_id),
		drinkItems: drinkItems.results,
		windows: { freshHours: FRESH_WINDOW_SECONDS / 3600, maxHours: MAX_GOOD_WINDOW_SECONDS / 3600 }
	};
};

export const actions: Actions = {
	saveGeneral: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const baseCode = String(form.get('baseCode') ?? 'MVR').trim().toUpperCase().slice(0, 8);
		const baseSymbol = String(form.get('baseSymbol') ?? 'Rf').trim().slice(0, 8);
		const basePrecision = Math.max(0, Math.min(4, Number(form.get('basePrecision') ?? 2)));
		const basePosition = form.get('basePosition') === 'after' ? 'after' : 'before';
		const multi = form.get('multiCurrency') === 'on' ? 1 : 0;
		const mode = form.get('conversionMode') === 'fixed' ? 'fixed' : 'api';
		await db.prepare('UPDATE restaurants SET base_code=?, base_symbol=?, base_precision=?, base_symbol_position=?, multi_currency_enabled=?, conversion_mode=?, settings_revision=settings_revision+1, updated_at=unixepoch() WHERE id=?')
			.bind(baseCode, baseSymbol, basePrecision, basePosition, multi, mode, user.restaurantId).run();
		await db.prepare("INSERT INTO audit_log (restaurant_id, actor, action, entity_type, created_at) VALUES (?, ?, 'settings.general', 'restaurant', unixepoch())").bind(user.restaurantId, user.username).run();
		return { saved: 'general' };
	},

	saveTheme: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const hex = (v: unknown, fallback: string) => {
			const s = String(v ?? '').trim();
			return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
		};
		const primary = hex(form.get('primary'), '#0d6d5b');
		const accent = hex(form.get('accent'), '#de5f34');
		const name = String(form.get('name') ?? '').trim().slice(0, 80) || 'Menyue';
		const logoKey = String(form.get('logoKey') ?? '').trim() || null;
		await db
			.prepare('UPDATE restaurants SET name=?, theme_primary=?, theme_accent=?, logo_key=?, settings_revision=settings_revision+1, updated_at=unixepoch() WHERE id=?')
			.bind(name, primary, accent, logoKey, user.restaurantId)
			.run();
		await db.prepare("INSERT INTO audit_log (restaurant_id, actor, action, entity_type, detail, created_at) VALUES (?, ?, 'settings.brand', 'restaurant', ?, unixepoch())").bind(user.restaurantId, user.username, JSON.stringify({ name, primary, accent })).run();
		return { saved: 'brand' };
	},

	saveCurrency: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = form.get('id') ? Number(form.get('id')) : null;
		const code = String(form.get('code') ?? '').trim().toUpperCase().slice(0, 8);
		const symbol = String(form.get('symbol') ?? '').trim().slice(0, 8);
		if (!code || !symbol) return fail(400, { error: 'Code and symbol required' });
		const precision = Math.max(0, Math.min(4, Number(form.get('precision') ?? 2)));
		const position = form.get('position') === 'after' ? 'after' : 'before';
		const order = Number(form.get('displayOrder') ?? 0) || 0;
		const enabled = form.get('enabled') === 'on' ? 1 : 0;
		const mode = form.get('mode') === 'fixed' ? 'fixed' : 'api';
		const fixedRate = form.get('fixedRate') ? Number(form.get('fixedRate')) : null;
		const fallbackRate = Number(form.get('fallbackRate') ?? 1) || 1;
		if (id) {
			await db.prepare('UPDATE currencies SET code=?, symbol=?, precision=?, symbol_position=?, display_order=?, enabled=?, mode=?, fixed_rate=?, fallback_rate=? WHERE id=? AND restaurant_id=?')
				.bind(code, symbol, precision, position, order, enabled, mode, fixedRate, fallbackRate, id, user.restaurantId).run();
		} else {
			try {
				await db.prepare('INSERT INTO currencies (restaurant_id, code, symbol, precision, symbol_position, display_order, enabled, mode, fixed_rate, fallback_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
					.bind(user.restaurantId, code, symbol, precision, position, order, enabled, mode, fixedRate, fallbackRate).run();
			} catch {
				return fail(400, { error: 'That currency code already exists' });
			}
		}
		return { saved: 'currency' };
	},

	removeCurrency: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		await db.prepare('DELETE FROM currencies WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId).run();
		return { saved: 'currency' };
	},

	refreshRates: async ({ locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const restaurant = await getRestaurant(db, user.restaurantId);
		const currencies = await getDisplayCurrencies(db, user.restaurantId, true);
		const result = await refreshRates(db, restaurant, currencies.filter((c) => c.enabled));
		return { refresh: result };
	},

	saveBeverage: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const enabled = form.get('enabled') === 'on' ? 1 : 0;
		const heading = String(form.get('heading') ?? '').trim().slice(0, 120);
		const body = String(form.get('body') ?? '').trim().slice(0, 300);
		const skip = String(form.get('skipLabel') ?? '').trim().slice(0, 60);
		await db.prepare('UPDATE restaurants SET beverage_prompt_enabled=?, beverage_prompt_heading=?, beverage_prompt_body=?, beverage_prompt_skip_label=?, updated_at=unixepoch() WHERE id=?')
			.bind(enabled, heading, body, skip, user.restaurantId).run();
		// category targets from checkboxes cat_<id>
		await db.prepare('DELETE FROM beverage_prompt_categories WHERE restaurant_id=?').bind(user.restaurantId).run();
		const stmts = [];
		for (const [k] of form.entries()) {
			if (k.startsWith('cat_')) {
				const cid = Number(k.slice(4));
				stmts.push(db.prepare('INSERT INTO beverage_prompt_categories (restaurant_id, category_id) VALUES (?, ?)').bind(user.restaurantId, cid));
			}
		}
		if (stmts.length) await db.batch(stmts);
		return { saved: 'beverage' };
	},

	addBeverageItem: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const itemId = Number(form.get('itemId'));
		try {
			await db.prepare('INSERT INTO beverage_prompt_items (restaurant_id, item_id, display_order) VALUES (?, ?, (SELECT COALESCE(MAX(display_order),0)+1 FROM beverage_prompt_items WHERE restaurant_id=?))').bind(user.restaurantId, itemId, user.restaurantId).run();
		} catch {
			return fail(400, { error: 'Already added' });
		}
		return { saved: 'beverage' };
	},

	removeBeverageItem: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const itemId = Number(form.get('itemId'));
		await db.prepare('DELETE FROM beverage_prompt_items WHERE restaurant_id=? AND item_id=?').bind(user.restaurantId, itemId).run();
		return { saved: 'beverage' };
	}
};
