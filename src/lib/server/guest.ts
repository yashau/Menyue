import type { D1Database } from '@cloudflare/workers-types';
import type { Category, DisplayCurrency, MenuItem, RateInfo, Restaurant } from '$lib/types';
import { getRestaurant, getDisplayCurrencies, resolveRates } from './currency';
import { getCategories, getMenuItems } from './menu';

export interface TableRef {
	id: number;
	label: string;
	token: string;
	restaurantId: number;
}

export async function resolveTable(db: D1Database, token: string): Promise<TableRef | null> {
	const row = await db
		.prepare('SELECT id, label, token, restaurant_id, enabled FROM tables WHERE token = ?')
		.bind(token)
		.first<{ id: number; label: string; token: string; restaurant_id: number; enabled: number }>();
	if (!row || !row.enabled) return null;
	return { id: row.id, label: row.label, token: row.token, restaurantId: row.restaurant_id };
}

export interface GuestBeverageConfig {
	enabled: boolean;
	heading: string;
	body: string;
	skipLabel: string;
	itemIds: number[];
	categoryIds: number[];
}

export interface GuestMenu {
	restaurant: Restaurant;
	table: TableRef;
	categories: Category[];
	items: MenuItem[];
	currencies: DisplayCurrency[];
	rates: RateInfo[];
	beverage: GuestBeverageConfig;
}

export async function loadGuestMenu(db: D1Database, table: TableRef): Promise<GuestMenu> {
	const restaurantId = table.restaurantId;
	const [restaurant, categories, items, currencies, bevItems, bevCats] = await Promise.all([
		getRestaurant(db, restaurantId),
		getCategories(db, restaurantId),
		getMenuItems(db, restaurantId),
		getDisplayCurrencies(db, restaurantId),
		db
			.prepare('SELECT item_id FROM beverage_prompt_items WHERE restaurant_id = ? ORDER BY display_order')
			.bind(restaurantId)
			.all<{ item_id: number }>(),
		db
			.prepare('SELECT category_id FROM beverage_prompt_categories WHERE restaurant_id = ?')
			.bind(restaurantId)
			.all<{ category_id: number }>()
	]);

	const rateMap = await resolveRates(db, restaurant, currencies);
	const rates = [...rateMap.values()];

	return {
		restaurant,
		table,
		categories,
		items,
		currencies,
		rates,
		beverage: {
			enabled: restaurant.beveragePrompt.enabled,
			heading: restaurant.beveragePrompt.heading,
			body: restaurant.beveragePrompt.body,
			skipLabel: restaurant.beveragePrompt.skipLabel,
			itemIds: bevItems.results.map((r) => r.item_id),
			categoryIds: bevCats.results.map((r) => r.category_id)
		}
	};
}
