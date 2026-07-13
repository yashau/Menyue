import { describe, expect, it } from 'vitest';
import { csvMetadata, matchesAdminItemSearch, moveInCanonicalOrder } from '$lib/admin-menu';

const item = {
	category_id: 'mains',
	name: 'Island curry',
	description: 'Fragrant coconut curry',
	category: 'Mains',
	code: 'MN-01',
	tags: 'signature, spicy',
	dietary_labels: 'gluten-free',
	enabled: 1,
	availability: 'available',
	discoverability: 'browse',
};

describe('admin item catalog behavior', () => {
	it('searches every customer-facing metadata field and combines filters', () => {
		expect(matchesAdminItemSearch(item, 'coconut', 'all', 'all')).toBe(true);
		expect(matchesAdminItemSearch(item, 'spicy', 'mains', 'enabled')).toBe(true);
		expect(matchesAdminItemSearch(item, 'gluten', 'mains', 'available')).toBe(true);
		expect(matchesAdminItemSearch(item, 'curry', 'starters', 'all')).toBe(false);
		expect(matchesAdminItemSearch(item, 'curry', 'all', 'sold_out')).toBe(false);
	});

	it('returns canonical gap-free order and rejects boundary moves', () => {
		const ordered = moveInCanonicalOrder(
			[
				{ id: 'a', position: 8 },
				{ id: 'b', position: 21 },
				{ id: 'c', position: 42 },
			],
			'b',
			'down',
		);
		expect(ordered.map((row) => row.id)).toEqual(['a', 'c', 'b']);
		expect(() => moveInCanonicalOrder(ordered, 'a', 'up')).toThrow('Invalid move');
	});

	it('normalizes comma-separated metadata without storing empty tags', () => {
		expect(csvMetadata(' vegan, spicy, vegan ,, ')).toBe('vegan, spicy');
		expect(csvMetadata('   ')).toBeNull();
	});
});
