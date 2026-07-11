import type { MenuItem } from './types';

// Uploaded photo (served from R2 via /media) if present, otherwise the
// procedural illustration fallback.
export function itemImage(
	item: Pick<MenuItem, 'imageKey' | 'imageSeed' | 'isBeverage'> | undefined | null
): string {
	if (!item) return '/img/dish?kind=food';
	if (item.imageKey && item.imageKey.trim()) return `/media/${item.imageKey}`;
	return `/img/${encodeURIComponent(item.imageSeed)}?kind=${item.isBeverage ? 'drink' : 'food'}`;
}
