import type { PublicMenu } from '$lib/types';

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
export function projectPublicMenu(input: {
	revision: number;
	currency: string;
	hero: Row;
	categories: Array<Row & { items: Array<Row> }>;
}): PublicMenu {
	return {
		revision: input.revision,
		currency: input.currency,
		hero: {
			title: String(input.hero.title || 'Menyue'),
			...(text(input.hero.description) ? { description: text(input.hero.description) } : {}),
			...(text(input.hero.ctaLabel) ? { ctaLabel: text(input.hero.ctaLabel) } : {}),
			...(text(input.hero.ctaUrl) ? { ctaUrl: text(input.hero.ctaUrl) } : {}),
			...(text(input.hero.photoId) ? { photoId: text(input.hero.photoId) } : {}),
		},
		categories: input.categories
			.filter((c) => Number(c.enabled) === 1 && Number(c.archived ?? 0) === 0)
			.map((category) => ({
				id: String(category.id),
				name: String(category.name),
				...(text(category.description) ? { description: text(category.description) } : {}),
				items: category.items
					.filter((item) => Number(item.enabled) === 1 && Number(item.archived ?? 0) === 0)
					.map((item) => ({
						id: String(item.id),
						code: String(item.code),
						name: String(item.name),
						priceMinor: Number(item.priceMinor),
						...(text(item.description) ? { description: text(item.description) } : {}),
						...(text(item.allergyNote) ? { allergyNote: text(item.allergyNote) } : {}),
						...(text(item.photoId) ? { photoId: text(item.photoId) } : {}),
						...(item.promotion
							? {
									promotion:
										item.promotion as PublicMenu['categories'][number]['items'][number]['promotion'],
								}
							: {}),
						...(item.allergens && (item.allergens as unknown[]).length
							? {
									allergens:
										item.allergens as PublicMenu['categories'][number]['items'][number]['allergens'],
								}
							: {}),
						...(item.comboGroups && (item.comboGroups as unknown[]).length
							? {
									comboGroups:
										item.comboGroups as PublicMenu['categories'][number]['items'][number]['comboGroups'],
								}
							: {}),
					})),
			}))
			.filter((category) => category.items.length > 0),
	};
}
export const demoMenu = (): PublicMenu =>
	projectPublicMenu({
		revision: 1,
		currency: 'MVR',
		hero: {
			title: 'Menyue',
			description: 'Made for the table, from first bite to last.',
			ctaLabel: 'Explore dishes',
			ctaUrl: '#menu',
		},
		categories: [
			{
				id: 'small',
				name: 'Small plates',
				enabled: true,
				items: [
					{
						id: 'crispy-tofu',
						code: 'ST-01',
						name: 'Crispy chilli tofu',
						description: 'Sesame, scallion and a sharp little kick.',
						priceMinor: 8800,
						enabled: true,
						allergyNote: 'Contains soy',
						promotion: { label: 'House favourite' },
					},
				],
			},
			{
				id: 'mains',
				name: 'Mains',
				enabled: true,
				items: [
					{
						id: 'coconut-curry',
						code: 'MN-02',
						name: 'Coconut curry bowl',
						description: 'Seasonal vegetables, fragrant rice and lime.',
						priceMinor: 14500,
						enabled: true,
						comboGroups: [
							{
								id: 'protein',
								name: 'Choose a protein',
								minChoices: 1,
								maxChoices: 1,
								enabled: true,
								choices: [
									{ id: 'tofu', name: 'Tofu', priceDeltaMinor: 0, enabled: true },
									{ id: 'prawn', name: 'Prawn', priceDeltaMinor: 3000, enabled: true },
								],
							},
						],
					},
				],
			},
		],
	});
export async function getPublicMenu(db: D1Database, restaurantId = 'demo'): Promise<PublicMenu> {
	try {
		const base = await db
			.prepare(
				'SELECT r.menu_revision, r.currency, s.title, s.description, s.cta_label, s.cta_url, s.hero_asset_id FROM restaurants r LEFT JOIN site_content s ON s.restaurant_id=r.id WHERE r.id=?',
			)
			.bind(restaurantId)
			.first<Row>();
		if (!base) return demoMenu();
		const categories = await db
			.prepare(
				'SELECT id,name,description,enabled,archived FROM menu_categories WHERE restaurant_id=? ORDER BY position',
			)
			.bind(restaurantId)
			.all<Row>();
		const result = [] as Array<Row & { items: Row[] }>;
		for (const category of categories.results) {
			const items = await db
				.prepare(
					'SELECT id,code,name,description,base_price_minor AS priceMinor,allergy_note AS allergyNote,photo_asset_id AS photoId,enabled,archived FROM menu_items WHERE category_id=? AND enabled=1 AND archived=0 ORDER BY position',
				)
				.bind(category.id)
				.all<Row>();
			for (const item of items.results) {
				const promotion = await db
					.prepare(
						'SELECT label,description,price_minor AS priceMinor FROM item_promotions WHERE item_id=? AND enabled=1 AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>CURRENT_TIMESTAMP) ORDER BY position LIMIT 1',
					)
					.bind(item.id)
					.first<Row>();
				const allergens = await db
					.prepare(
						'SELECT a.name,ia.severity FROM item_allergens ia JOIN allergens a ON a.id=ia.allergen_id WHERE ia.item_id=?',
					)
					.bind(item.id)
					.all();
				const groups = await db
					.prepare(
						'SELECT id,name,min_choices AS minChoices,max_choices AS maxChoices,enabled FROM combo_groups WHERE item_id=? AND enabled=1 ORDER BY position',
					)
					.bind(item.id)
					.all<Row>();
				for (const group of groups.results) {
					const choices = await db
						.prepare(
							'SELECT id,name,price_delta_minor AS priceDeltaMinor,enabled FROM combo_choices WHERE group_id=? AND enabled=1 ORDER BY position',
						)
						.bind(group.id)
						.all();
					group.choices = choices.results;
				}
				item.promotion = promotion ?? undefined;
				item.allergens = allergens.results;
				item.comboGroups = groups.results;
			}
			result.push({ ...category, items: items.results });
		}
		return projectPublicMenu({
			revision: Number(base.menu_revision),
			currency: String(base.currency),
			hero: {
				title: base.title,
				description: base.description,
				ctaLabel: base.cta_label,
				ctaUrl: base.cta_url,
				photoId: base.hero_asset_id,
			},
			categories: result,
		});
	} catch {
		return demoMenu();
	}
}
