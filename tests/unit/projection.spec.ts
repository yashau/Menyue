import { describe, it, expect } from 'vitest';
import { projectPublicMenu } from '../../src/lib/server/menu';
import { createCustomerMenuSearchIndex, customerAllergyNotices, customerMenuImageSource, customerMenuSearchText } from '../../src/lib/customer-menu';
describe('public menu projection', () =>
	it('omits optional empty values and disabled records', () => {
		const menu = projectPublicMenu({
			revision: 1,
			currency: 'USD',
			currencyMinorUnit: 2,
			currencyLocale: 'en-US',
			hero: { title: 'A', description: '' },
			categories: [
				{
					id: 'x',
					name: 'X',
					enabled: true,
					items: [
						{ id: 'i', code: 'I', name: 'Item', priceMinor: 100, enabled: true, description: '' },
						{ id: 'off', code: 'O', name: 'Off', priceMinor: 100, enabled: false },
					],
				},
			],
		});
		expect(menu.hero).not.toHaveProperty('description');
		expect(menu.categories[0].items).toHaveLength(1);
		expect(menu.categories[0].items[0]).not.toHaveProperty('description');
		expect(menu).toMatchObject({ currency: 'USD', currencyMinorUnit: 2, currencyLocale: 'en-US' });
		expect(menu.brand).toMatchObject({ primary: '#18372F', accent: '#EC6A45' });
	}));

	it('projects branding per tenant and drops malformed colours or asset identifiers', () => {
		const menu = projectPublicMenu({
			revision: 1, currency: 'USD', hero: { title: 'Tenant', primaryColor: '#0a4b7c', accentColor: 'red; color:white', logoAssetId: '../other-tenant' }, categories: [],
		});
		expect(menu.brand).toEqual({ primary: '#0A4B7C', primaryForeground: '#ffffff', accent: '#EC6A45', accentForeground: '#000000' });
	});

	it('keeps suggestion-only items out of browsing while retaining available suggestions', () => {
		const menu = projectPublicMenu({
			revision: 1, currency: 'USD', hero: { title: 'A' }, categories: [{ id: 'c', name: 'C', enabled: 1, items: [
				{ id: 'main', code: 'M', name: 'Main', priceMinor: 100, enabled: 1, discoverability: 'browse', availability: 'available', suggestions: [{ id: 'hidden', code: 'H', name: 'Hidden add-on', priceMinor: 50, availability: 'available' }] },
				{ id: 'hidden', code: 'H', name: 'Hidden add-on', priceMinor: 50, enabled: 1, discoverability: 'suggestion_only', availability: 'available' },
				{ id: 'sold', code: 'S', name: 'Sold out', priceMinor: 50, enabled: 1, discoverability: 'browse', availability: 'sold_out' },
			] }],
		});
		expect(menu.categories[0].items.map((item) => item.id)).toEqual(['main', 'sold']);
		expect(menu.categories[0].items[0].suggestions?.[0]).toMatchObject({ id: 'hidden', availability: 'available' });
		expect(menu.categories[0].items[1].availability).toBe('sold_out');
	});

describe('customer menu assets and metadata', () => {
	it('prefers a media asset, accepts only safe local menu images, and omits unsafe sources', () => {
		expect(customerMenuImageSource({ photoId: 'asset / 1', imageUrl: '/menu/garden-salad.png' })).toBe('/media/asset%20%2F%201');
		expect(customerMenuImageSource({ imageUrl: '/menu/garden-salad.png' })).toBe('/media/static?src=%2Fmenu%2Fgarden-salad.png');
		expect(customerMenuImageSource({ imageUrl: 'https://images.example/salad.png' })).toBeUndefined();
		expect(customerMenuImageSource({ imageUrl: '/menu/../private.png' })).toBeUndefined();
		expect(customerMenuImageSource({ imageUrl: '/menu/salad.svg' })).toBeUndefined();
	});

	it('keeps structured metadata searchable and avoids duplicating matching allergy data', () => {
		const item = {
			name: 'Menyue burger',
			allergyNote: 'Contains gluten and dairy.',
			allergens: [{ name: 'gluten', severity: 'contains' }, { name: 'dairy', severity: 'contains' }],
			dietaryLabels: ['halal'],
			tags: ['grill'],
			promotion: { label: 'Lunch offer', description: 'Available today.' },
		};
		expect(customerAllergyNotices(item)).toEqual(['Contains gluten and dairy.']);
		expect(customerMenuSearchText(item, 'Mains')).toContain('available today');
		expect(customerAllergyNotices({ allergens: [{ name: 'nuts', severity: 'may_contain' }] })).toEqual(['May contain nuts.']);
	});

	it('rebuilds search results from a replacement menu payload', () => {
		const before = createCustomerMenuSearchIndex([{ id: 'mains', name: 'Mains', items: [{ id: 'burger', code: 'BURGER', name: 'Menyue burger', priceMinor: 1450, availability: 'available' }] }]);
		const after = createCustomerMenuSearchIndex([{ id: 'drinks', name: 'Drinks', items: [{ id: 'water', code: 'WATER', name: 'Lime water', priceMinor: 250, availability: 'available' }] }]);
		expect(before.search('burger').groups[0]?.items.map((item) => item.id)).toEqual(['burger']);
		expect(after.search('burger').resultCount).toBe(0);
		expect(after.search('water').groups[0]?.category.id).toBe('drinks');
	});
});
