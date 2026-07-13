import type { PublicCategory, PublicItem } from '$lib/types';

type SearchableItem = Pick<
	PublicItem,
	'name' | 'description' | 'allergyNote' | 'allergens' | 'dietaryLabels' | 'tags' | 'promotion'
>;

export type CustomerMenuSearchGroup = {
	category: PublicCategory;
	items: PublicItem[];
};

export type CustomerMenuSearchResult = {
	query: string;
	resultCount: number;
	groups: CustomerMenuSearchGroup[];
};

const STATIC_MENU_IMAGE = /^\/menu\/[a-z0-9][a-z0-9._-]*\.(?:avif|jpe?g|png|webp)$/i;

/**
 * Customer-provided image URLs are intentionally limited to local static menu assets.
 * Uploaded images always use a media asset id and are served through /media/:assetId.
 */
export function isSafeCustomerMenuImageUrl(imageUrl: string | undefined): imageUrl is string {
	return Boolean(imageUrl && STATIC_MENU_IMAGE.test(imageUrl));
}

export function customerMenuImageSource(
	item: Pick<PublicItem, 'photoId' | 'imageUrl'>,
): string | undefined {
	if (item.photoId?.trim()) return `/media/${encodeURIComponent(item.photoId.trim())}`;
	const imageUrl = item.imageUrl?.trim();
	return isSafeCustomerMenuImageUrl(imageUrl)
		? `/media/static?src=${encodeURIComponent(imageUrl)}`
		: undefined;
}

/** Makes customer search forgiving of case, accents, and incidental whitespace. */
export function normalizeCustomerMenuSearch(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

export function customerMenuSearchText(item: SearchableItem, categoryName: string): string {
	return normalizeCustomerMenuSearch(
		[
			item.name,
			item.description ?? '',
			categoryName,
			item.allergyNote ?? '',
			...(item.allergens?.map((allergen) => allergen.name) ?? []),
			...(item.dietaryLabels ?? []),
			...(item.tags ?? []),
			item.promotion?.label ?? '',
			item.promotion?.description ?? '',
		].join(' '),
	);
}

/**
 * Builds the searchable text once per menu. Both customer routes then derive their
 * category groups and result count from this same index.
 */
export function createCustomerMenuSearchIndex(categories: readonly PublicCategory[]): {
	search(query: string): CustomerMenuSearchResult;
} {
	const indexedCategories = categories.map((category) => ({
		category,
		items: category.items.map((item) => ({
			item,
			text: customerMenuSearchText(item, category.name),
		})),
	}));

	return {
		search(query: string): CustomerMenuSearchResult {
			const normalizedQuery = normalizeCustomerMenuSearch(query);
			const groups = indexedCategories
				.map(({ category, items }) => ({
					category,
					items: items
						.filter(({ text }) => !normalizedQuery || text.includes(normalizedQuery))
						.map(({ item }) => item),
				}))
				.filter((group) => group.items.length > 0);
			return {
				query: normalizedQuery,
				resultCount: groups.reduce((count, group) => count + group.items.length, 0),
				groups,
			};
		},
	};
}

function list(names: string[]) {
	return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}

/** Avoid repeating an allergy note when its named allergens already cover the structured data. */
export function customerAllergyNotices(
	item: Pick<PublicItem, 'allergyNote' | 'allergens'>,
): string[] {
	const note = item.allergyNote?.trim();
	const covered = note?.toLowerCase() ?? '';
	const remaining = (item.allergens ?? []).filter(
		(allergen) => !covered.includes(allergen.name.toLowerCase()),
	);
	const grouped = new Map<string, string[]>();
	for (const allergen of remaining) {
		const severity = allergen.severity?.trim().toLowerCase() || 'contains';
		grouped.set(severity, [...(grouped.get(severity) ?? []), allergen.name]);
	}
	const notices = note ? [note] : [];
	for (const [severity, names] of grouped) {
		const prefix =
			severity === 'may_contain' || severity === 'may contain' ? 'May contain' : 'Contains';
		notices.push(`${prefix} ${list(names)}.`);
	}
	return notices;
}
