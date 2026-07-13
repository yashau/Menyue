import { describe, expect, it } from 'vitest';
import {
	ORDER_LINE_CAP,
	addBundle,
	addVariantToBundle,
	cartTotalMinor,
	createOrderCart,
	flattenOrder,
	hasBeverage,
	lineCount,
	replaceBundle,
	splitVariant,
	transitionOrderFlow,
	type FlowEvent,
	type FlowState,
} from '../../src/lib/customer/order-state';

function ids(...values: string[]) {
	let index = 0;
	return () => values[index++] ?? `overflow-${index}`;
}

describe('customer order cart', () => {
	it('splits one unit into a customized plate and preserves quantities and totals', () => {
		const added = addBundle(
			createOrderCart(),
			{ parent: { itemId: 'curry', quantity: 3, unitMinor: 1200 } },
			ids('bundle', 'line', 'split'),
		);
		const split = splitVariant(
			added.cart,
			added.lineId!,
			{ choiceIds: ['mild'], note: '  no  onion ' },
			ids('custom'),
		);
		expect(split.accepted).toBe(true);
		expect(flattenOrder(split.cart)).toEqual([
			{ itemId: 'curry', quantity: 2, choiceIds: [] },
			{ itemId: 'curry', quantity: 1, choiceIds: ['mild'], note: 'no onion' },
		]);
		expect(cartTotalMinor(split.cart)).toBe(3600);
	});

	it('merges identical variants without changing total quantity or total', () => {
		const added = addBundle(
			createOrderCart(),
			{ parent: { itemId: 'tea', quantity: 1, choiceIds: ['ice'], unitMinor: 400 } },
			ids('bundle', 'line'),
		);
		const merged = addVariantToBundle(
			added.cart,
			added.bundleId!,
			{ itemId: 'tea', quantity: 2, choiceIds: ['ice'], unitMinor: 400 },
			'beverage',
			ids('ignored'),
		);
		expect(lineCount(merged.cart)).toBe(1);
		expect(flattenOrder(merged.cart)[0].quantity).toBe(3);
		expect(cartTotalMinor(merged.cart)).toBe(1200);
	});

	it('keeps duplicate item IDs as independent API lines when options or notes differ', () => {
		const added = addBundle(
			createOrderCart(),
			{ parent: { itemId: 'tea', choiceIds: ['lemon'] } },
			ids('bundle', 'line'),
		);
		const customized = addVariantToBundle(
			added.cart,
			added.bundleId!,
			{ itemId: 'tea', choiceIds: ['milk'], note: 'less sugar' },
			'beverage',
			ids('line-2'),
		);
		expect(flattenOrder(customized.cart)).toEqual([
			{ itemId: 'tea', quantity: 1, choiceIds: ['lemon'] },
			{ itemId: 'tea', quantity: 1, choiceIds: ['milk'], note: 'less sugar' },
		]);
	});

	it('keeps suggestion provenance on a configurable child line', () => {
		const added = addBundle(
			createOrderCart(),
			{
				parent: { itemId: 'burger' },
				additions: [{ itemId: 'hidden-drink', choiceIds: ['cold'], suggestedFromItemId: 'burger' }],
			},
			ids('bundle', 'parent', 'drink'),
		);
		expect(flattenOrder(added.cart)).toEqual([
			{ itemId: 'burger', quantity: 1, choiceIds: [] },
			{ itemId: 'hidden-drink', quantity: 1, choiceIds: ['cold'], suggestedFromItemId: 'burger' },
		]);
	});

	it('preserves suggestion provenance when a parent bundle edit changes the child options', () => {
		const added = addBundle(
			createOrderCart(),
			{
				parent: { itemId: 'burger', choiceIds: ['fries'] },
				additions: [{ itemId: 'hidden-drink', choiceIds: ['cold'], suggestedFromItemId: 'burger' }],
			},
			ids('bundle', 'parent', 'drink'),
		);
		const edited = replaceBundle(
			added.cart,
			added.bundleId!,
			{
				parent: { itemId: 'burger', choiceIds: ['salad'] },
				additions: [{ itemId: 'hidden-drink', choiceIds: ['room'], suggestedFromItemId: 'burger' }],
			},
			ids('new-parent', 'new-drink'),
		);
		expect(flattenOrder(edited.cart)).toEqual([
			{ itemId: 'burger', quantity: 1, choiceIds: ['salad'] },
			{ itemId: 'hidden-drink', quantity: 1, choiceIds: ['room'], suggestedFromItemId: 'burger' },
		]);
	});

	it('preserves suggestion provenance when splitting one configured unit from a multi-quantity variant', () => {
		const added = addBundle(
			createOrderCart(),
			{
				parent: { itemId: 'burger' },
				additions: [
					{
						itemId: 'hidden-drink',
						quantity: 3,
						choiceIds: ['cold'],
						suggestedFromItemId: 'burger',
					},
				],
			},
			ids('bundle', 'parent', 'drink'),
		);
		const drink = added.cart.bundles[0].lines.find((line) => line.itemId === 'hidden-drink')!;
		const split = splitVariant(added.cart, drink.lineId, { choiceIds: ['room'] }, ids('split'));
		expect(flattenOrder(split.cart)).toEqual([
			{ itemId: 'burger', quantity: 1, choiceIds: [] },
			{ itemId: 'hidden-drink', quantity: 2, choiceIds: ['cold'], suggestedFromItemId: 'burger' },
			{ itemId: 'hidden-drink', quantity: 1, choiceIds: ['room'], suggestedFromItemId: 'burger' },
		]);
	});

	it('enforces the API 30 flattened-line cap and checks beverages across all bundle variants', () => {
		let cart = createOrderCart();
		for (let index = 0; index < ORDER_LINE_CAP; index += 1) {
			const result = addBundle(
				cart,
				{ parent: { itemId: `item-${index}` } },
				ids(`bundle-${index}`, `line-${index}`),
			);
			expect(result.accepted).toBe(true);
			cart = result.cart;
		}
		const rejected = addBundle(
			cart,
			{ parent: { itemId: 'one-too-many' } },
			ids('overflow-bundle', 'overflow-line'),
		);
		expect(rejected).toMatchObject({ accepted: false, reason: 'line-cap' });
		expect(hasBeverage(cart, ['item-29'])).toBe(true);
	});

	it('atomically replaces bundle children while retaining equivalent line identities and quantities', () => {
		const added = addBundle(
			createOrderCart(),
			{
				parent: { itemId: 'burger', quantity: 2, choiceIds: ['fries'], note: 'warm' },
				additions: [{ itemId: 'water', choiceIds: ['cold'], note: 'no ice' }],
			},
			ids('bundle', 'parent', 'water'),
		);
		const original = added.cart.bundles[0];
		const edited = replaceBundle(
			added.cart,
			added.bundleId!,
			{
				parent: { itemId: 'burger', quantity: 2, choiceIds: ['salad'], note: 'warm' },
				additions: [
					{ itemId: 'water', choiceIds: ['cold'], note: 'no ice' },
					{ itemId: 'tea', note: 'hot' },
				],
			},
			ids('new-parent', 'tea'),
		);
		expect(edited.accepted).toBe(true);
		expect(edited.cart.bundles[0].lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					lineId: original.lines[1].lineId,
					itemId: 'water',
					quantity: 1,
					choiceIds: ['cold'],
					note: 'no ice',
				}),
				expect.objectContaining({ lineId: 'new-parent', itemId: 'burger', choiceIds: ['salad'] }),
				expect.objectContaining({ lineId: 'tea', itemId: 'tea', note: 'hot' }),
			]),
		);
		expect(flattenOrder(edited.cart)).toEqual([
			{ itemId: 'burger', quantity: 2, choiceIds: ['salad'], note: 'warm' },
			{ itemId: 'water', quantity: 1, choiceIds: ['cold'], note: 'no ice' },
			{ itemId: 'tea', quantity: 1, choiceIds: [], note: 'hot' },
		]);
	});
});

describe('customer order flow', () => {
	const scenarios: Array<{ state: FlowState; event: FlowEvent; destination: FlowState['kind'] }> = [
		{
			state: { kind: 'browsing' },
			event: { type: 'ADD', hasModifiers: true, hasSuggestions: false },
			destination: 'configuring',
		},
		{
			state: {
				kind: 'configuring',
				target: 'parent',
				returnTo: 'browsing',
				parentHasModifiers: true,
				hasSuggestions: false,
			},
			event: { type: 'SUGGEST', hasSuggestions: false, parentHasModifiers: true },
			destination: 'reviewing',
		},
		{
			state: { kind: 'suggesting', parentHasModifiers: false },
			event: { type: 'CONFIGURE', target: 'suggestion', hasModifiers: true },
			destination: 'configuring',
		},
		{
			state: { kind: 'reviewing', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'COMMIT' },
			destination: 'browsing',
		},
		{
			state: { kind: 'reviewing', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'SUBMIT', needsBeverage: true },
			destination: 'beverage-prompt',
		},
		{
			state: { kind: 'beverage-prompt', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'ADD_BEVERAGE', hasModifiers: true },
			destination: 'configuring',
		},
		{
			state: { kind: 'beverage-prompt', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'SKIP' },
			destination: 'submitting',
		},
		{
			state: { kind: 'submitting', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'SUBMISSION_FAILED' },
			destination: 'retrying',
		},
		{
			state: { kind: 'retrying', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'RETRY' },
			destination: 'submitting',
		},
		{
			state: { kind: 'submitting', parentHasModifiers: false, hasSuggestions: false },
			event: { type: 'CONFIRM' },
			destination: 'confirmed',
		},
		{ state: { kind: 'confirmed' }, event: { type: 'CONFIRM' }, destination: 'browsing' },
	];

	it('gives every supported event a deterministic destination', () => {
		for (const scenario of scenarios) {
			const result = transitionOrderFlow(scenario.state, scenario.event);
			expect(result.accepted, scenario.event.type).toBe(true);
			expect(result.state.kind, scenario.event.type).toBe(scenario.destination);
		}
	});

	it('has bounded Back, Cancel, and Continue paths and never invents empty stages', () => {
		const noStages = transitionOrderFlow(
			{ kind: 'browsing' },
			{ type: 'ADD', hasModifiers: false, hasSuggestions: false },
		);
		expect(noStages.state.kind).toBe('reviewing');
		const back = transitionOrderFlow(noStages.state, { type: 'BACK' });
		expect(back.state.kind).toBe('browsing');
		const cancelled = transitionOrderFlow(
			{ kind: 'suggesting', parentHasModifiers: false },
			{ type: 'ESCAPE' },
		);
		expect(cancelled).toMatchObject({ accepted: true, state: { kind: 'cancelled' } });
		expect(transitionOrderFlow(cancelled.state, { type: 'CONFIRM' }).state.kind).toBe('browsing');
		expect(transitionOrderFlow({ kind: 'browsing' }, { type: 'BACK' })).toMatchObject({
			accepted: false,
			state: { kind: 'browsing' },
		});
	});

	it('bounds every flow state with a valid exit rather than cycling an invalid event', () => {
		const exits: Array<{ state: FlowState; event: FlowEvent }> = [
			{
				state: { kind: 'browsing' },
				event: { type: 'ADD', hasModifiers: false, hasSuggestions: false },
			},
			{
				state: {
					kind: 'configuring',
					target: 'parent',
					returnTo: 'browsing',
					parentHasModifiers: true,
					hasSuggestions: false,
				},
				event: { type: 'BACK' },
			},
			{
				state: { kind: 'suggesting', parentHasModifiers: false },
				event: { type: 'REVIEW', parentHasModifiers: false, hasSuggestions: true },
			},
			{
				state: { kind: 'reviewing', parentHasModifiers: false, hasSuggestions: false },
				event: { type: 'SUBMIT', needsBeverage: false },
			},
			{
				state: { kind: 'beverage-prompt', parentHasModifiers: true, hasSuggestions: true },
				event: { type: 'BACK' },
			},
			{
				state: { kind: 'submitting', parentHasModifiers: false, hasSuggestions: false },
				event: { type: 'SUBMISSION_FAILED' },
			},
			{
				state: { kind: 'retrying', parentHasModifiers: true, hasSuggestions: false },
				event: { type: 'BACK' },
			},
			{ state: { kind: 'confirmed' }, event: { type: 'CONFIRM' } },
			{ state: { kind: 'cancelled' }, event: { type: 'CONFIRM' } },
		];
		for (const { state, event } of exits) {
			const result = transitionOrderFlow(state, event);
			expect(result.accepted, state.kind).toBe(true);
			expect(result.state).not.toEqual(state);
		}
	});
});
