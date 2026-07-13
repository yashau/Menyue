import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The product authorization matrix. `public` means a valid table token or
 * public asset may still be required; it never grants staff/counter access.
 */
const matrix = {
	'/admin': { unauthenticated: 'redirect:login', manager: 'allow', admin: 'allow', counter: 'redirect:login' },
	'/admin/login': { unauthenticated: 'allow', manager: 'allow', admin: 'allow', counter: 'allow' },
	'/admin/logout': { unauthenticated: '401', manager: 'csrf:user', admin: 'csrf:user', counter: '401' },
	'/admin/change-password': { unauthenticated: 'redirect:login', manager: 'csrf:user', admin: 'csrf:user', counter: 'redirect:login' },
	'/admin/hero': { unauthenticated: 'redirect:login', manager: 'csrf:hero:write', admin: 'csrf:hero:write', counter: 'redirect:login' },
	'/admin/menu/categories': { unauthenticated: 'redirect:login', manager: 'csrf:menu:write', admin: 'csrf:menu:write', counter: 'redirect:login' },
	'/admin/menu/items': { unauthenticated: 'redirect:login', manager: 'csrf:menu:write', admin: 'csrf:menu:write', counter: 'redirect:login' },
	'/admin/settings': { unauthenticated: 'redirect:login', manager: '403', admin: 'csrf:admin', counter: 'redirect:login' },
	'/admin/tables': { unauthenticated: 'redirect:login', manager: '403', admin: 'csrf:admin', counter: 'redirect:login' },
	'/admin/users': { unauthenticated: 'redirect:login', manager: '403', admin: 'csrf:admin', counter: 'redirect:login' },
	'/admin/counter-operators': { unauthenticated: 'redirect:login', manager: '403', admin: 'csrf:admin', counter: 'redirect:login' },
	'/counter': { unauthenticated: 'redirect:counter-login', manager: 'redirect:counter-login', admin: 'redirect:counter-login', counter: 'allow' },
	'/counter/login': { unauthenticated: 'allow', manager: 'allow', admin: 'allow', counter: 'allow' },
	'/counter/logout': { unauthenticated: '401', manager: '401', admin: '401', counter: 'csrf:counter' },
	'/api/counter/orders': { unauthenticated: '401', manager: '401', admin: '401', counter: 'allow' },
	'/api/counter/orders/:id': { unauthenticated: '401', manager: '401', admin: '401', counter: 'csrf:counter' },
	'/api/counter/stream': { unauthenticated: '401', manager: '401', admin: '401', counter: 'allow' },
	'/api/tables/:token/orders': { unauthenticated: 'public:valid-table-token', manager: 'public:valid-table-token', admin: 'public:valid-table-token', counter: 'public:valid-table-token' },
	'/t/:token': { unauthenticated: 'public:valid-table-token', manager: 'public:valid-table-token', admin: 'public:valid-table-token', counter: 'public:valid-table-token' },
	'/media/:assetId': { unauthenticated: 'public:active-asset', manager: 'public:active-asset', admin: 'public:active-asset', counter: 'public:active-asset' },
} as const;

const source = (path: string) => readFile(resolve(process.cwd(), path), 'utf8');

describe('authorization matrix', () => {
	it('documents every staff, counter, table, and public asset boundary', () => {
		expect(Object.keys(matrix)).toHaveLength(20);
		expect(matrix['/admin/menu/items'].manager).toBe('csrf:menu:write');
		expect(matrix['/admin/settings'].manager).toBe('403');
		expect(matrix['/api/counter/orders'].admin).toBe('401');
		expect(matrix['/api/tables/:token/orders'].counter).toBe('public:valid-table-token');
	});

	it('keeps all privileged server seams guarded and all state changes CSRF-protected', async () => {
		const [permissions, hooks, counterLogout, counterPatch, adminLogout, password, hero, categories, items, settings, tables, users, operators, media, fixture] = await Promise.all([
			source('src/lib/server/permissions.ts'), source('src/hooks.server.ts'), source('src/routes/counter/logout/+server.ts'), source('src/routes/api/counter/orders/[id]/+server.ts'), source('src/routes/admin/logout/+server.ts'), source('src/routes/admin/change-password/+page.server.ts'), source('src/routes/admin/hero/+page.server.ts'), source('src/routes/admin/menu/categories/+page.server.ts'), source('src/routes/admin/menu/items/+page.server.ts'), source('src/routes/admin/settings/+page.server.ts'), source('src/routes/admin/tables/+page.server.ts'), source('src/routes/admin/users/+page.server.ts'), source('src/routes/admin/counter-operators/+page.server.ts'), source('src/lib/server/media.ts'), source('scripts/setup-local.mjs'),
		]);
		expect(permissions).toMatch(/!locals\.user\) throw error\(401/);
		expect(permissions).toMatch(/locals\.user\.role !== 'admin'\) throw error\(403/);
		expect(hooks).toContain("DELETE FROM sessions WHERE token_hash=?");
		for (const route of [counterLogout, counterPatch, adminLogout, password, hero, categories, items, settings, tables, users, operators]) {
			expect(route).toContain('requireCsrf');
		}
		expect(counterLogout).toMatch(/!event\.locals\.counter\) throw error\(401/);
		expect(counterPatch).toMatch(/!event\.locals\.counter\) return json\(.+status: 401/);
		expect(users).toMatch(/AND EXISTS\(SELECT 1 FROM users other WHERE other\.role='admin' AND other\.enabled=1 AND other\.id!=\?\)/);
		expect(media).toContain('restaurantId: string');
		expect(media).toContain('restaurant_id');
		expect(fixture).toContain("'demo',${sqlString(UPLOADED_MENU_ASSET.key)}");
	});
});
