import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFile(resolve(root, path), 'utf8');

const routes = [
	{ path: 'settings', actions: ['save', 'sync', 'beverage', 'currency', 'removeCurrency', 'makeBase'] },
	{ path: 'tables', actions: ['create', 'rotate', 'toggle'] },
	{ path: 'users', actions: ['create', 'update', 'reset'] },
	{ path: 'menu/categories', actions: ['create', 'update', 'archive', 'move'] },
	{ path: 'menu/items', actions: ['save', 'availability', 'archive', 'move', 'promotion', 'group', 'groupEdit', 'groupDelete', 'groupMove', 'choice', 'choiceEdit', 'choiceDelete', 'choiceMove', 'suggestion', 'suggestionDelete'] },
	{ path: 'hero', actions: ['save'] },
] as const;

describe('admin action parity', () => {
	it('keeps every declared mutation reachable from an explicitly named POST form', async () => {
		for (const route of routes) {
			const page = await source(`src/routes/admin/${route.path}/+page.svelte`);
			const server = await source(`src/routes/admin/${route.path}/+page.server.ts`);
			expect(page).not.toMatch(/<Button(?![^>]*\btype=)/);
			for (const action of route.actions) {
				expect(server).toMatch(new RegExp(`\\b${action}:\\s*async`));
				expect(page).toMatch(new RegExp(`method="POST"\\s+action="\\?/${action}"`));
			}
		}
	});

	it('guards action routes with CSRF, authorization, and durable audit coverage', async () => {
		for (const route of routes) {
			const server = await source(`src/routes/admin/${route.path}/+page.server.ts`);
			expect(server).toMatch(/requireCsrf|await guard\(e\)/);
			expect(server).toMatch(/requireAdmin|requireCapability|await guard\(e\)/);
			expect(server).toContain('audit');
		}
		const [logout, password, login, loginPage, passwordPage, layout] = await Promise.all([
			source('src/routes/admin/logout/+server.ts'),
			source('src/routes/admin/change-password/+page.server.ts'),
			source('src/routes/admin/login/+page.server.ts'),
			source('src/routes/admin/login/+page.svelte'),
			source('src/routes/admin/change-password/+page.svelte'),
			source('src/routes/admin/+layout.svelte'),
		]);
		expect(logout).toMatch(/requireUser[\s\S]*requireCsrf[\s\S]*audit/);
		expect(password).toMatch(/requireUser[\s\S]*requireCsrf[\s\S]*audit/);
		expect(login).toContain('audit');
		expect(loginPage).toMatch(/<form method="POST"/);
		expect(passwordPage).toMatch(/<form method="POST"/);
		expect(layout).toMatch(/<form method="POST" action="\/admin\/logout"/);
	});
});
