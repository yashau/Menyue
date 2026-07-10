import { expect, it } from 'vitest';
import { projectPublicMenu } from '../../src/lib/server/menu';
it('does not project numeric disabled rows', () => {
	const m = projectPublicMenu({
		revision: 1,
		currency: 'MVR',
		hero: { title: 'x' },
		categories: [
			{
				id: 'c',
				name: 'c',
				enabled: 1,
				archived: 0,
				items: [
					{ id: 'on', code: 'on', name: 'on', priceMinor: 1, enabled: 1, archived: 0 },
					{ id: 'off', code: 'off', name: 'off', priceMinor: 1, enabled: 0, archived: 0 },
				],
			},
		],
	});
	expect(m.categories[0].items.map((x) => x.id)).toEqual(['on']);
});
