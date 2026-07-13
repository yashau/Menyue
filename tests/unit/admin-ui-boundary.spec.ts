import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const adminRoutes = [
	'admin/+layout.svelte',
	'admin/+page.svelte',
	'admin/login/+page.svelte',
	'admin/change-password/+page.svelte',
	'admin/menu/categories/+page.svelte',
	'admin/menu/items/+page.svelte',
	'admin/hero/+page.svelte',
	'admin/tables/+page.svelte',
	'admin/users/+page.svelte',
	'admin/settings/+page.svelte',
];

const adminPrimitives = [
	'button/button.svelte',
	'input/input.svelte',
	'textarea/textarea.svelte',
	'label/label.svelte',
	'badge/badge.svelte',
	'switch/switch.svelte',
	'separator/separator.svelte',
	'card/card.svelte',
	'card/card-header.svelte',
	'card/card-content.svelte',
	'card/card-footer.svelte',
	'card/card-title.svelte',
	'card/card-description.svelte',
	'select/select-content.svelte',
	'select/select-item.svelte',
	'select/select-trigger.svelte',
	'sidebar/sidebar.svelte',
	'sidebar/sidebar-content.svelte',
	'sidebar/sidebar-header.svelte',
	'sidebar/sidebar-inset.svelte',
	'sidebar/sidebar-menu-button.svelte',
	'sidebar/sidebar-menu-sub-button.svelte',
	'sheet/sheet-content.svelte',
	'tooltip/tooltip-content.svelte',
];

async function source(path: string) {
	return readFile(resolve(root, 'src/routes', path), 'utf8');
}

describe('admin UI boundary', () => {
	it('uses the default neutral registry and keeps customer styling out of admin routes', async () => {
		const [components, css, ...routes] = await Promise.all([
			readFile(resolve(root, 'components.json'), 'utf8'),
			readFile(resolve(root, 'src/routes/layout.css'), 'utf8'),
			...adminRoutes.map(source),
		]);

		expect(JSON.parse(components).style).toBe('default');
		expect(css).toContain('--font-sans: Arial, sans-serif;');
		expect(css).not.toContain(':root {\n\t--ink:');
		expect(css).toContain(".table-shell [data-slot='button']");
		for (const route of routes) {
			expect(route).not.toMatch(/\$lib\/components\/(?!ui\/)/);
			expect(route).not.toMatch(
				/(?:#[0-9a-f]{3,8}(?![a-z0-9])|(?:bg|text|border)-(?:amber|blue|emerald|green|orange|pink|purple|red|violet|yellow)-)/i,
			);
			expect(route).not.toMatch(
				/(?:rounded-(?:2xl|3xl|4xl)|shadow-(?:md|lg|xl)|font-(?:serif|\[))/,
			);
		}
	});

	it('does not expose luma large-radius primitives to the admin component graph', async () => {
		const primitives = await Promise.all(
			adminPrimitives.map((path) => readFile(resolve(root, 'src/lib/components/ui', path), 'utf8')),
		);
		for (const primitive of primitives) {
			expect(primitive).not.toMatch(
				/rounded-(?:2xl|3xl|4xl)|--radius:var\(--radius-xl\)|shadow-xl/,
			);
		}
	});

	it('delegates mobile sidebar Escape handling to the canonical Sheet dialog', async () => {
		const sidebar = await readFile(resolve(root, 'src/lib/components/ui/sidebar/sidebar.svelte'), 'utf8');

		expect(sidebar).toContain('import * as Sheet from "$lib/components/ui/sheet/index.js";');
		expect(sidebar).not.toMatch(/<svelte:window\b|handleMobileEscape|onkeydown=/);
	});

	it('keeps item editing compact while preserving modal state and accessible ordering', async () => {
		const [page, server] = await Promise.all([
			source('admin/menu/items/+page.svelte'),
			readFile(resolve(root, 'src/routes/admin/menu/items/+page.server.ts'), 'utf8'),
		]);
		expect(page).toContain('use:enhance={preserveEditorOnSave}');
		expect(page).toContain('Clear search and status filters to reorder');
		expect(page).toContain('name="dietaryLabels"');
		expect(page).toContain('name="tags"');
		expect(page).toContain('name="imageUrl"');
		expect(page).toContain('Prepare a menu-card image before upload.');
		expect(page).toContain('Apply crop');
		expect(page).toContain('width="1200" height={Math.round(1200 / MENU_IMAGE_ASPECTS[cropAspect])}');
		expect(page).toContain('aria-label={`Move ${value(item.name)} up within ${value(item.category)}`}');
		expect(server).toContain('c.restaurant_id=?');
		expect(server).toContain('moveInCanonicalOrder(rows.results, id, direction)');
		expect(server).toContain('ORDER BY c.position,i.position,i.id');
	});
});
