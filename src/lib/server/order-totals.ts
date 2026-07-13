export const MAX_MONEY_MINOR = 1_000_000_000;

export function addOrderLineTotal(unitMinor: number, quantity: number, runningTotal: number): number | null {
	const lineTotal = unitMinor * quantity;
	if (
		![unitMinor, lineTotal, runningTotal, runningTotal + lineTotal].every(
			(value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_MINOR,
		)
	)
		return null;
	return lineTotal;
}
