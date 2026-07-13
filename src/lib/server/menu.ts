import type { PublicItem, PublicMenu } from '$lib/types';
import { displayQuotes } from '$lib/server/currency';
import { projectCustomerBrand } from '$lib/branding';

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
export function projectPublicMenu(input: {
	revision: number;
	currency: string;
	currencyMinorUnit?: number;
	currencyLocale?: string;
	hero: Row;
	categories: Array<Row & { items: Array<Row> }>;
}): PublicMenu {
	return {
		revision: input.revision,
		currency: input.currency,
		currencyMinorUnit: input.currencyMinorUnit ?? 2,
		currencyLocale: input.currencyLocale ?? 'en-US',
		brand: projectCustomerBrand({
			primaryColor: input.hero.primaryColor,
			accentColor: input.hero.accentColor,
			logoAssetId: input.hero.logoAssetId,
		}),
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
					.filter(
						(item) =>
							Number(item.enabled) === 1 &&
							Number(item.archived ?? 0) === 0 &&
							String(item.discoverability ?? 'browse') === 'browse',
					)
					.map((item) => ({
						id: String(item.id),
						code: String(item.code),
						name: String(item.name),
						priceMinor: Number(item.priceMinor),
						availability: (String(item.availability) === 'sold_out' ? 'sold_out' : 'available') as
							| 'available'
							| 'sold_out',
						...(text(item.description) ? { description: text(item.description) } : {}),
						...(text(item.allergyNote) ? { allergyNote: text(item.allergyNote) } : {}),
						...(text(item.photoId) ? { photoId: text(item.photoId) } : {}),
						...(text(item.imageUrl) ? { imageUrl: text(item.imageUrl) } : {}),
						...(text(item.dietaryLabels)
							? {
									dietaryLabels: String(item.dietaryLabels)
										.split(',')
										.map((value) => value.trim())
										.filter(Boolean),
								}
							: {}),
						...(text(item.tags)
							? {
									tags: String(item.tags)
										.split(',')
										.map((value) => value.trim())
										.filter(Boolean),
								}
							: {}),
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
						...(item.suggestions && (item.suggestions as unknown[]).length
							? { suggestions: item.suggestions as PublicItem[] }
							: {}),
					})),
			}))
			.filter((category) => category.items.length > 0),
	};
}
export const demoMenu = (): PublicMenu =>
	projectPublicMenu({
		revision: 1,
		currency: 'USD',
		currencyMinorUnit: 2,
		currencyLocale: 'en-US',
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
				'SELECT r.menu_revision, r.currency, r.currency_minor_unit AS currencyMinorUnit, r.currency_locale AS currencyLocale, s.title, s.description, s.cta_label, s.cta_url, s.hero_asset_id, s.logo_asset_id, s.primary_color, s.accent_color FROM restaurants r LEFT JOIN site_content s ON s.restaurant_id=r.id WHERE r.id=?',
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
					"SELECT id,code,name,description,base_price_minor AS priceMinor,allergy_note AS allergyNote,photo_asset_id AS photoId,image_url AS imageUrl,dietary_labels AS dietaryLabels,tags,availability,discoverability,enabled,archived FROM menu_items WHERE category_id=? AND enabled=1 AND archived=0 AND discoverability='browse' ORDER BY position",
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
							'SELECT id,name,price_delta_minor AS priceDeltaMinor,enabled,is_default AS isDefault FROM combo_choices WHERE group_id=? AND enabled=1 ORDER BY position',
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
		const suggestionRows = await db
			.prepare(
				"SELECT s.item_id,s.suggested_item_id,i.code,i.name,i.description,i.base_price_minor AS priceMinor,i.allergy_note AS allergyNote,i.photo_asset_id AS photoId,i.image_url AS imageUrl,i.dietary_labels AS dietaryLabels,i.tags,i.availability,i.discoverability FROM item_suggestions s JOIN menu_items i ON i.id=s.suggested_item_id JOIN menu_categories c ON c.id=i.category_id WHERE s.restaurant_id=? AND s.enabled=1 AND c.enabled=1 AND c.archived=0 AND i.enabled=1 AND i.archived=0 AND i.availability='available' ORDER BY s.position,s.suggested_item_id",
			)
			.bind(restaurantId)
			.all<Row & { item_id: string }>();
		for (const row of suggestionRows.results) {
			const groups = await db
				.prepare(
					'SELECT id,name,min_choices AS minChoices,max_choices AS maxChoices,enabled FROM combo_groups WHERE item_id=? AND enabled=1 ORDER BY position',
				)
				.bind(row.suggested_item_id)
				.all<Row>();
			for (const group of groups.results)
				group.choices = (
					await db
						.prepare(
							'SELECT id,name,price_delta_minor AS priceDeltaMinor,enabled,is_default AS isDefault FROM combo_choices WHERE group_id=? AND enabled=1 ORDER BY position',
						)
						.bind(group.id)
						.all()
				).results;
			row.comboGroups = groups.results;
			row.promotion =
				(await db
					.prepare(
						'SELECT label,description,price_minor AS priceMinor FROM item_promotions WHERE item_id=? AND enabled=1 AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>CURRENT_TIMESTAMP) ORDER BY position LIMIT 1',
					)
					.bind(row.suggested_item_id)
					.first<Row>()) ?? undefined;
			row.allergens = (
				await db
					.prepare(
						'SELECT a.name,ia.severity FROM item_allergens ia JOIN allergens a ON a.id=ia.allergen_id WHERE ia.item_id=?',
					)
					.bind(row.suggested_item_id)
					.all()
			).results;
		}
		for (const category of result)
			for (const item of category.items)
				item.suggestions = suggestionRows.results
					.filter((row) => row.item_id === item.id)
					.map((row) => ({ ...row, id: row.suggested_item_id, enabled: 1, archived: 0 }));
		const menu = projectPublicMenu({
			revision: Number(base.menu_revision),
			currency: String(base.currency),
			currencyMinorUnit: Number(base.currencyMinorUnit ?? 2),
			currencyLocale: String(base.currencyLocale ?? 'en-US'),
			hero: {
				title: base.title,
				description: base.description,
				ctaLabel: base.cta_label,
				ctaUrl: base.cta_url,
				photoId: base.hero_asset_id,
				primaryColor: base.primary_color,
				accentColor: base.accent_color,
				logoAssetId: base.logo_asset_id,
			},
			categories: result,
		});
		const displays = await displayQuotes(db, restaurantId);
		if (displays.length)
			menu.displayCurrencies = displays.map((display) => ({
				code: display.code,
				numerator: display.rate.numerator.toString(),
				denominator: display.rate.denominator.toString(),
				source: display.rate.source,
				minorUnit: display.minorUnit,
				locale: display.locale,
				freshness: display.freshness,
			}));
		const beverage = await db
			.prepare(
				'SELECT p.heading,p.body,p.skip_label FROM beverage_prompt_settings p WHERE p.restaurant_id=? AND p.enabled=1',
			)
			.bind(restaurantId)
			.first<{ heading: string; body: string; skip_label: string }>();
		if (beverage)
			menu.beveragePrompt = {
				heading: beverage.heading,
				body: beverage.body,
				skipLabel: beverage.skip_label,
				itemIds: (
					await db
						.prepare(
							"SELECT DISTINCT i.id FROM menu_items i JOIN menu_categories c ON c.id=i.category_id LEFT JOIN beverage_prompt_items pi ON pi.item_id=i.id AND pi.restaurant_id=? LEFT JOIN beverage_prompt_categories pc ON pc.category_id=c.id AND pc.restaurant_id=? WHERE c.restaurant_id=? AND i.enabled=1 AND i.archived=0 AND i.availability='available' AND c.enabled=1 AND c.archived=0 AND (pi.item_id IS NOT NULL OR (pc.category_id IS NOT NULL AND i.discoverability='browse'))",
						)
						.bind(restaurantId, restaurantId, restaurantId)
						.all<{ id: string }>()
				).results.map((row) => row.id),
			};
		return menu;
	} catch {
		return demoMenu();
	}
}
