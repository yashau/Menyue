import type { D1Database } from '@cloudflare/workers-types';
import type { Category, MenuItem, OptionChoice, OptionGroup } from '$lib/types';

function parseJsonArray(value: unknown): string[] {
	if (typeof value !== 'string') return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

export async function getCategories(
	db: D1Database,
	restaurantId: number,
	opts: { includeDisabled?: boolean } = {}
): Promise<Category[]> {
	const rows = await db
		.prepare(
			`SELECT id, name, description, display_order, enabled FROM categories
			 WHERE restaurant_id = ? ${opts.includeDisabled ? '' : 'AND enabled = 1'}
			 ORDER BY display_order, name`
		)
		.bind(restaurantId)
		.all<{ id: number; name: string; description: string | null; display_order: number; enabled: number }>();
	return rows.results.map((r) => ({
		id: r.id,
		name: r.name,
		description: r.description,
		displayOrder: r.display_order,
		enabled: !!r.enabled
	}));
}

interface ItemRow {
	id: number;
	category_id: number | null;
	name: string;
	description: string | null;
	base_price: number;
	image_seed: string;
	image_key: string | null;
	availability: 'available' | 'unavailable';
	enabled: number;
	listed: number;
	allergens: string;
	dietary: string;
	tags: string;
	label: string | null;
	label_kind: 'info' | 'promo' | 'new';
	is_beverage: number;
	display_order: number;
}

interface GroupRow {
	id: number;
	item_id: number;
	name: string;
	selection_type: 'single' | 'multiple';
	required: number;
	min_select: number;
	max_select: number;
	allow_none: number;
	display_order: number;
}

interface ChoiceRow {
	id: number;
	group_id: number;
	name: string;
	price_adjustment: number;
	is_default: number;
	display_order: number;
}

export async function getMenuItems(
	db: D1Database,
	restaurantId: number,
	opts: { includeDisabled?: boolean } = {}
): Promise<MenuItem[]> {
	const [items, groups, choices, suggestions] = await Promise.all([
		db
			.prepare(
				`SELECT * FROM items WHERE restaurant_id = ? ${opts.includeDisabled ? '' : 'AND enabled = 1'}
				 ORDER BY display_order, name`
			)
			.bind(restaurantId)
			.all<ItemRow>(),
		db
			.prepare('SELECT * FROM option_groups WHERE restaurant_id = ? ORDER BY display_order, id')
			.bind(restaurantId)
			.all<GroupRow>(),
		db
			.prepare('SELECT * FROM option_choices WHERE restaurant_id = ? ORDER BY display_order, id')
			.bind(restaurantId)
			.all<ChoiceRow>(),
		db
			.prepare('SELECT source_item_id, target_item_id FROM suggestions WHERE restaurant_id = ? AND enabled = 1 ORDER BY display_order, id')
			.bind(restaurantId)
			.all<{ source_item_id: number; target_item_id: number }>()
	]);

	const choicesByGroup = new Map<number, OptionChoice[]>();
	for (const c of choices.results) {
		const list = choicesByGroup.get(c.group_id) ?? [];
		list.push({
			id: c.id,
			name: c.name,
			priceAdjustment: c.price_adjustment,
			isDefault: !!c.is_default,
			displayOrder: c.display_order
		});
		choicesByGroup.set(c.group_id, list);
	}

	const groupsByItem = new Map<number, OptionGroup[]>();
	for (const g of groups.results) {
		const list = groupsByItem.get(g.item_id) ?? [];
		list.push({
			id: g.id,
			name: g.name,
			selectionType: g.selection_type,
			required: !!g.required,
			minSelect: g.min_select,
			maxSelect: g.max_select,
			allowNone: !!g.allow_none,
			displayOrder: g.display_order,
			choices: choicesByGroup.get(g.id) ?? []
		});
		groupsByItem.set(g.item_id, list);
	}

	const suggByItem = new Map<number, number[]>();
	for (const s of suggestions.results) {
		const list = suggByItem.get(s.source_item_id) ?? [];
		list.push(s.target_item_id);
		suggByItem.set(s.source_item_id, list);
	}

	return items.results.map((r) => ({
		id: r.id,
		categoryId: r.category_id,
		name: r.name,
		description: r.description,
		basePrice: r.base_price,
		imageSeed: r.image_seed,
		imageKey: r.image_key,
		availability: r.availability,
		enabled: !!r.enabled,
		listed: !!r.listed,
		allergens: parseJsonArray(r.allergens),
		dietary: parseJsonArray(r.dietary),
		tags: parseJsonArray(r.tags),
		label: r.label,
		labelKind: r.label_kind,
		isBeverage: !!r.is_beverage,
		displayOrder: r.display_order,
		optionGroups: groupsByItem.get(r.id) ?? [],
		suggestionIds: suggByItem.get(r.id) ?? []
	}));
}
