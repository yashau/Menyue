export const MAX_PROMOTION_MINOR = 1_000_000_000;

export function parsePromotionMinor(value: FormDataEntryValue | null): number | null {
	const text = String(value ?? '').trim();
	if (text === '') return null;
	const minor = Math.round(Number(text) * 100);
	if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_PROMOTION_MINOR)
		throw new RangeError('Promotion price must be a non-negative amount up to 10,000,000.00.');
	return minor;
}
