import { describe, it, expect } from 'vitest';
import { projectPublicMenu } from '../../src/lib/server/menu';
describe('public menu projection', () =>
	it('omits optional empty values and disabled records', () => {
		const menu = projectPublicMenu({
			revision: 1,
			currency: 'MVR',
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
	}));
