import { describe, it, expect } from 'vitest';
import { defaultSelections, validate, toCartOptions, selectionsFromOptions } from './wizard';
import type { MenuItem, OptionGroup } from './types';

function group(partial: Partial<OptionGroup> & { id: number; choices: OptionGroup['choices'] }): OptionGroup {
	return {
		name: 'G',
		selectionType: 'single',
		required: false,
		minSelect: 0,
		maxSelect: 1,
		allowNone: false,
		displayOrder: 0,
		...partial
	};
}

function item(groups: OptionGroup[]): MenuItem {
	return {
		id: 1,
		categoryId: 1,
		name: 'Test',
		description: null,
		basePrice: 10000,
		imageSeed: 'test',
		imageKey: null,
		availability: 'available',
		enabled: true,
		listed: true,
		allergens: [],
		dietary: [],
		tags: [],
		label: null,
		labelKind: 'info',
		isBeverage: false,
		displayOrder: 0,
		optionGroups: groups,
		suggestionIds: []
	};
}

const requiredSingle = group({
	id: 10,
	name: 'Size',
	selectionType: 'single',
	required: true,
	minSelect: 1,
	maxSelect: 1,
	choices: [
		{ id: 100, name: 'Regular', priceAdjustment: 0, isDefault: false, displayOrder: 0 },
		{ id: 101, name: 'Large', priceAdjustment: 2500, isDefault: false, displayOrder: 1 }
	]
});

const optionalMulti = group({
	id: 20,
	name: 'Extras',
	selectionType: 'multiple',
	required: false,
	minSelect: 0,
	maxSelect: 2,
	allowNone: true,
	choices: [
		{ id: 200, name: 'Bacon', priceAdjustment: 2000, isDefault: false, displayOrder: 0 },
		{ id: 201, name: 'Cheese', priceAdjustment: 1500, isDefault: true, displayOrder: 1 },
		{ id: 202, name: 'Egg', priceAdjustment: 1000, isDefault: false, displayOrder: 2 }
	]
});

describe('wizard validation', () => {
	it('flags a required group with nothing selected', () => {
		const res = validate(item([requiredSingle]), { 10: [] });
		expect(res.valid).toBe(false);
		expect(res.errors[10]).toBeTruthy();
	});

	it('passes a required group once a choice is selected and prices it', () => {
		const res = validate(item([requiredSingle]), { 10: [101] });
		expect(res.valid).toBe(true);
		expect(res.priceDelta).toBe(2500);
	});

	it('enforces max selections on multiple groups', () => {
		const res = validate(item([optionalMulti]), { 20: [200, 201, 202] });
		expect(res.valid).toBe(false);
		expect(res.errors[20]).toContain('up to 2');
	});

	it('allows zero selections when optional', () => {
		const res = validate(item([optionalMulti]), { 20: [] });
		expect(res.valid).toBe(true);
	});

	it('defaults pick isDefault choices', () => {
		const sel = defaultSelections(item([requiredSingle, optionalMulti]));
		expect(sel[10]).toEqual([]); // no default on required single
		expect(sel[20]).toEqual([201]); // cheese is default
	});

	it('builds and restores cart option snapshots', () => {
		const opts = toCartOptions(item([requiredSingle]), { 10: [101] });
		expect(opts).toHaveLength(1);
		expect(opts[0]).toMatchObject({ groupId: 10, choiceId: 101, choiceName: 'Large', priceAdjustment: 2500 });
		const restored = selectionsFromOptions(item([requiredSingle]), opts);
		expect(restored[10]).toEqual([101]);
	});
});
