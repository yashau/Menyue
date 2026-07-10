import { describe, it, expect } from 'vitest';
import { can } from '../../src/lib/server/permissions';
describe('permissions', () => {
	it('lets managers edit menus but not users', () => {
		expect(can('manager', 'menu:write')).toBe(true);
		expect(can('manager', 'users:write')).toBe(false);
	});
	it('lets admins manage roles', () => expect(can('admin', 'users:write')).toBe(true));
});
