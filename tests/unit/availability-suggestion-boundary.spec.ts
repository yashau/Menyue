import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFile(resolve(root, path), 'utf8');

describe('item discoverability and availability boundaries', () => {
	it('migrates existing items to browse-visible and available defaults', async () => {
		const migration = await source('migrations/0014_item_discoverability_availability.sql');
		expect(migration).toContain("discoverability TEXT NOT NULL DEFAULT 'browse'");
		expect(migration).toContain("availability TEXT NOT NULL DEFAULT 'available'");
		expect(migration).toContain("CHECK(discoverability IN ('browse','suggestion_only'))");
		expect(migration).toContain("CHECK(availability IN ('available','sold_out'))");
	});

	it('projects sold-out browse items but filters sold-out suggestions and configured drinks', async () => {
		const menu = await source('src/lib/server/menu.ts');
		expect(menu).toContain("discoverability='browse'");
		expect(menu).toContain("i.availability='available'");
		expect(menu).toContain("i.discoverability='browse'");
	});

	it('requires a tenant-scoped enabled edge and an in-order source for suggestion-only lines', async () => {
		const orders = await source('src/routes/api/tables/[token]/orders/+server.ts');
		expect(orders).toContain('suggestedFromItemId');
		expect(orders).toContain("item.discoverability !== 'suggestion_only'");
		expect(orders).toContain('!ids.includes(wanted.suggestedFromItemId)');
		expect(orders).toContain(
			's.restaurant_id=? AND s.item_id=? AND s.suggested_item_id=? AND s.enabled=1',
		);
		expect(orders).toContain('source_category.restaurant_id=?');
		expect(orders).toContain("item.availability !== 'available'");
	});

	it('uses tenant-scoped, gap-free suggestion order with a stable projection tie-breaker', async () => {
		const [admin, menu] = await Promise.all([
			source('src/routes/admin/menu/items/+page.server.ts'),
			source('src/lib/server/menu.ts'),
		]);
		expect(admin).toContain('Number.isSafeInteger(position) || position < 0');
		expect(admin).toContain(
			'WHERE restaurant_id=? AND item_id=? AND suggested_item_id<>? ORDER BY position,suggested_item_id',
		);
		expect(admin).toContain(
			'UPDATE item_suggestions SET position=? WHERE restaurant_id=? AND item_id=? AND suggested_item_id=?',
		);
		expect(admin).toContain('await normalizeSuggestionPositions(e.platform!.env.DB, restaurant, item);');
		expect(menu).toContain('ORDER BY s.position,s.suggested_item_id');
	});
});
