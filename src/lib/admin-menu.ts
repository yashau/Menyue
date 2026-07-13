export type AdminItemSearchRow = {
	category_id?: unknown;
	name?: unknown;
	description?: unknown;
	category?: unknown;
	code?: unknown;
	tags?: unknown;
	dietary_labels?: unknown;
	enabled?: unknown;
	availability?: unknown;
	discoverability?: unknown;
};

const value = (input: unknown) => String(input ?? '');

/** Pure client-side filter so a large loaded catalog remains quick to narrow. */
export function matchesAdminItemSearch(
	item: AdminItemSearchRow,
	query: string,
	categoryId: string,
	status: string,
): boolean {
	const needle = query.trim().toLowerCase();
	const categoryMatches = categoryId === 'all' || value(item.category_id) === categoryId;
	const statusMatches =
		status === 'all' ||
		(status === 'enabled' && Number(item.enabled) === 1) ||
		(status === 'disabled' && Number(item.enabled) !== 1) ||
		(status === 'available' && value(item.availability) === 'available') ||
		(status === 'sold_out' && value(item.availability) === 'sold_out') ||
		(status === 'browse' && value(item.discoverability || 'browse') === 'browse') ||
		(status === 'suggestion_only' && value(item.discoverability) === 'suggestion_only');
	if (!needle) return categoryMatches && statusMatches;
	return (
		categoryMatches &&
		statusMatches &&
		[
			item.name,
			item.description,
			item.category,
			item.code,
			item.tags,
			item.dietary_labels,
		]
			.map(value)
			.join(' ')
			.toLowerCase()
			.includes(needle)
	);
}

/** Returns a canonical, gap-free ordering after a single accessible move. */
export function moveInCanonicalOrder<T extends { id: string }>(
	rows: readonly T[],
	id: string,
	direction: 'up' | 'down',
): T[] {
	const index = rows.findIndex((row) => row.id === id);
	const target = direction === 'up' ? index - 1 : index + 1;
	if (index < 0 || target < 0 || target >= rows.length) throw new Error('Invalid move');
	const ordered = [...rows];
	[ordered[index], ordered[target]] = [ordered[target], ordered[index]];
	return ordered;
}

export function csvMetadata(input: FormDataEntryValue | null): string | null {
	const values = String(input ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	return values.length ? [...new Set(values)].join(', ') : null;
}
