import type { CartOptionSelection, MenuItem, OptionGroup } from './types';

// selections: groupId -> chosen choiceIds (single groups hold 0 or 1)
export type Selections = Record<number, number[]>;

export interface BuiltLine {
	itemId: number;
	quantity: number;
	notes: string;
	options: CartOptionSelection[];
	isSuggested: boolean;
}

export function effectiveMin(group: OptionGroup): number {
	return group.required && !group.allowNone ? Math.max(1, group.minSelect) : group.minSelect;
}

// Whether a single-choice group offers an explicit "None".
export function offersNone(group: OptionGroup): boolean {
	return group.selectionType === 'single' && (group.allowNone || !group.required);
}

export function defaultSelections(item: MenuItem): Selections {
	const sel: Selections = {};
	for (const g of item.optionGroups) {
		const defaults = g.choices.filter((c) => c.isDefault).map((c) => c.id);
		if (g.selectionType === 'single') {
			sel[g.id] = defaults.slice(0, 1);
		} else {
			sel[g.id] = g.maxSelect > 0 ? defaults.slice(0, g.maxSelect) : defaults;
		}
	}
	return sel;
}

// Like defaultSelections, but also satisfies required groups that have no
// explicit default by auto-picking the first choice(s). Guarantees a valid
// selection for one-tap adds (e.g. the beverage prompt).
export function autoSelections(item: MenuItem): Selections {
	const sel = defaultSelections(item);
	for (const g of item.optionGroups) {
		const min = effectiveMin(g);
		const chosen = sel[g.id] ?? [];
		if (chosen.length < min) {
			const fill = g.choices
				.filter((c) => !chosen.includes(c.id))
				.slice(0, min - chosen.length)
				.map((c) => c.id);
			sel[g.id] = [...chosen, ...fill];
		}
	}
	return sel;
}

export function validate(item: MenuItem, selections: Selections) {
	const errors: Record<number, string> = {};
	let priceDelta = 0;
	for (const g of item.optionGroups) {
		const chosen = selections[g.id] ?? [];
		const min = effectiveMin(g);
		if (chosen.length < min) {
			errors[g.id] =
				g.selectionType === 'single'
					? 'Please choose an option'
					: `Choose at least ${min}`;
		} else if (g.maxSelect > 0 && chosen.length > g.maxSelect) {
			errors[g.id] = `Choose up to ${g.maxSelect}`;
		}
		for (const id of chosen) {
			const c = g.choices.find((x) => x.id === id);
			if (c) priceDelta += c.priceAdjustment;
		}
	}
	return { valid: Object.keys(errors).length === 0, errors, priceDelta };
}

export function toCartOptions(item: MenuItem, selections: Selections): CartOptionSelection[] {
	const out: CartOptionSelection[] = [];
	for (const g of item.optionGroups) {
		for (const id of selections[g.id] ?? []) {
			const c = g.choices.find((x) => x.id === id);
			if (c) {
				out.push({
					groupId: g.id,
					groupName: g.name,
					choiceId: c.id,
					choiceName: c.name,
					priceAdjustment: c.priceAdjustment
				});
			}
		}
	}
	return out;
}

// Rebuild a selections map from stored cart options (for editing a line).
export function selectionsFromOptions(item: MenuItem, options: CartOptionSelection[]): Selections {
	const sel: Selections = {};
	for (const g of item.optionGroups) sel[g.id] = [];
	for (const o of options) {
		if (sel[o.groupId]) sel[o.groupId].push(o.choiceId);
		else sel[o.groupId] = [o.choiceId];
	}
	return sel;
}
