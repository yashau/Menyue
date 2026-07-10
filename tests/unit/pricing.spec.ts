import { describe, expect, it } from 'vitest';
import { priceLines } from '../../src/lib/server/orders';
describe('server pricing', () => {
	const items = new Map([
		[
			'bowl',
			{
				name: 'Bowl',
				priceMinor: 1000,
				enabled: true,
				comboGroups: [
					{
						id: 'protein',
						name: 'Protein',
						minChoices: 1,
						maxChoices: 1,
						enabled: true,
						choices: [
							{ id: 'tofu', name: 'Tofu', priceDeltaMinor: 0, enabled: true },
							{ id: 'prawn', name: 'Prawn', priceDeltaMinor: 300, enabled: true },
						],
					},
				],
			},
		],
	]);
	it('computes combo totals without client prices', () =>
		expect(
			priceLines([{ itemId: 'bowl', quantity: 2, choiceIds: ['prawn'] }], items)[0].totalMinor,
		).toBe(2600));
	it('rejects invalid combo selections', () =>
		expect(() => priceLines([{ itemId: 'bowl', quantity: 1 }], items)).toThrow('Select'));
});
