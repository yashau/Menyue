import type { Role } from '$lib/types';
import { error } from '@sveltejs/kit';
export type Capability =
	| 'menu:write'
	| 'hero:write'
	| 'tables:write'
	| 'users:write'
	| 'orders:read'
	| 'orders:write';
const grants: Record<Role, Capability[]> = {
	admin: ['menu:write', 'hero:write', 'tables:write', 'users:write', 'orders:read', 'orders:write'],
	manager: ['menu:write', 'hero:write'],
};
export function can(role: Role | undefined, capability: Capability): boolean {
	return !!role && grants[role].includes(capability);
}
export function requireCapability(locals: App.Locals, capability: Capability): void {
	if (!locals.user) throw error(401, 'Authentication is required.');
	if (!can(locals.user.role, capability)) throw error(403, 'You do not have permission to do that.');
}
export function requireAdmin(locals: App.Locals): void {
	if (!locals.user) throw error(401, 'Authentication is required.');
	if (locals.user.role !== 'admin') throw error(403, 'You do not have permission to do that.');
}
