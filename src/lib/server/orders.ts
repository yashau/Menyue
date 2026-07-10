import type { ComboGroup } from '$lib/types';
export type RequestedLine = { itemId: string; quantity: number; choiceIds?: string[] };
export type PricedLine = {
	itemId: string;
	name: string;
	quantity: number;
	unitMinor: number;
	totalMinor: number;
	choices: { id: string; name: string; priceDeltaMinor: number }[];
};
export function priceLines(
	lines: RequestedLine[],
	items: Map<
		string,
		{ name: string; priceMinor: number; enabled: boolean; comboGroups?: ComboGroup[] }
	>,
): PricedLine[] {
	if (!lines.length || lines.length > 30) throw new Error('Choose between 1 and 30 dishes.');
	return lines.map((line) => {
		const item = items.get(line.itemId);
		if (
			!item?.enabled ||
			!Number.isInteger(line.quantity) ||
			line.quantity < 1 ||
			line.quantity > 20
		)
			throw new Error('One or more dishes are unavailable.');
		const requested = new Set(line.choiceIds ?? []);
		const choices = (item.comboGroups ?? [])
			.filter((g) => g.enabled)
			.flatMap((group) => {
				const picked = group.choices.filter((c) => c.enabled && requested.has(c.id));
				if (picked.length < group.minChoices || picked.length > group.maxChoices)
					throw new Error(
						`Select ${group.minChoices}–${group.maxChoices} option(s) for ${group.name}.`,
					);
				return picked;
			});
		const unitMinor = item.priceMinor + choices.reduce((sum, c) => sum + c.priceDeltaMinor, 0);
		return {
			itemId: line.itemId,
			name: item.name,
			quantity: line.quantity,
			unitMinor,
			totalMinor: unitMinor * line.quantity,
			choices,
		};
	});
}
