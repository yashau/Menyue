import type { PublicItem } from '$lib/types';

type SearchableItem = Pick<
	PublicItem,
	'name' | 'description' | 'allergyNote' | 'allergens' | 'dietaryLabels' | 'tags' | 'promotion'
>;

const STATIC_MENU_IMAGE = /^\/menu\/[a-z0-9][a-z0-9._-]*\.(?:avif|jpe?g|png|webp)$/i;

/**
 * Customer-provided image URLs are intentionally limited to local static menu assets.
 * Uploaded images always use a media asset id and are served through /media/:assetId.
 */
export function isSafeCustomerMenuImageUrl(imageUrl: string | undefined): imageUrl is string {
	return Boolean(imageUrl && STATIC_MENU_IMAGE.test(imageUrl));
}

export function customerMenuImageSource(item: Pick<PublicItem, 'photoId' | 'imageUrl'>): string | undefined {
	if (item.photoId?.trim()) return `/media/${encodeURIComponent(item.photoId.trim())}`;
	const imageUrl = item.imageUrl?.trim();
	return isSafeCustomerMenuImageUrl(imageUrl) ? `/media/static?src=${encodeURIComponent(imageUrl)}` : undefined;
}

export function customerMenuSearchText(item: SearchableItem, categoryName: string): string {
	return [
		item.name,
		item.description ?? '',
		categoryName,
		item.allergyNote ?? '',
		...(item.allergens?.map((allergen) => allergen.name) ?? []),
		...(item.dietaryLabels ?? []),
		...(item.tags ?? []),
		item.promotion?.label ?? '',
		item.promotion?.description ?? '',
	]
		.join(' ')
		.toLowerCase();
}

function list(names: string[]) {
	return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}

/** Avoid repeating an allergy note when its named allergens already cover the structured data. */
export function customerAllergyNotices(item: Pick<PublicItem, 'allergyNote' | 'allergens'>): string[] {
	const note = item.allergyNote?.trim();
	const covered = note?.toLowerCase() ?? '';
	const remaining = (item.allergens ?? []).filter((allergen) => !covered.includes(allergen.name.toLowerCase()));
	const grouped = new Map<string, string[]>();
	for (const allergen of remaining) {
		const severity = allergen.severity?.trim().toLowerCase() || 'contains';
		grouped.set(severity, [...(grouped.get(severity) ?? []), allergen.name]);
	}
	const notices = note ? [note] : [];
	for (const [severity, names] of grouped) {
		const prefix = severity === 'may_contain' || severity === 'may contain' ? 'May contain' : 'Contains';
		notices.push(`${prefix} ${list(names)}.`);
	}
	return notices;
}
