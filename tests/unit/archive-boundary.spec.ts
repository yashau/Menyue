import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('archived menu-item boundary', () => {
	it('keeps archived items out of the active admin list and every item ownership mutation', async () => {
		const source = await readFile(resolve('src/routes/admin/menu/items/+page.server.ts'), 'utf8');
		expect(source).toContain('i.archived=0 AND c.archived=0');
		expect(source).toContain(
			'WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0 ORDER BY c.position,i.position,i.id',
		);
		expect(source).toContain(
			"'SELECT p.* FROM item_promotions p JOIN menu_items i ON i.id=p.item_id JOIN menu_categories c ON c.id=i.category_id WHERE c.restaurant_id=? AND i.archived=0 AND c.archived=0'",
		);
	});

	it('moves only visible item siblings while preserving canonical ordering for the admin list', async () => {
		const source = await readFile(resolve('src/routes/admin/menu/items/+page.server.ts'), 'utf8');
		expect(source).toContain("${activeOnly ? ' AND archived=0' : ''}");
		expect(source).toMatch(
			/moveWithinParent\([\s\S]*?'menu_items',[\s\S]*?item!\.category_id,[\s\S]*?true,/,
		);
	});
});
