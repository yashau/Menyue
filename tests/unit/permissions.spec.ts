import { describe, it, expect } from 'vitest';
import { can, requireAdmin, requireCapability } from '../../src/lib/server/permissions';
describe('permissions', () => {
	it('lets managers edit menus but not users', () => {
		expect(can('manager', 'menu:write')).toBe(true);
		expect(can('manager', 'users:write')).toBe(false);
	});
	it('lets admins manage roles', () => expect(can('admin', 'users:write')).toBe(true));

	it('keeps the capability grants exact', () => {
		expect(can('admin', 'orders:read')).toBe(true);
		expect(can('admin', 'orders:write')).toBe(true);
		expect(can('manager', 'hero:write')).toBe(true);
		expect(can('manager', 'tables:write')).toBe(false);
		expect(can('manager', 'orders:read')).toBe(false);
		expect(can(undefined, 'menu:write')).toBe(false);
	});

	it('distinguishes an absent principal from a forbidden principal', () => {
		expect(() => requireCapability({}, 'menu:write')).toThrow(expect.objectContaining({ status: 401 }));
		expect(() => requireCapability({ user: { id: 'manager', username: 'manager', role: 'manager', csrf: 'csrf' } }, 'users:write')).toThrow(expect.objectContaining({ status: 403 }));
		expect(() => requireAdmin({ user: { id: 'manager', username: 'manager', role: 'manager', csrf: 'csrf' } })).toThrow(expect.objectContaining({ status: 403 }));
	});
});
