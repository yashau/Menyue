import type { Role } from '$lib/types';
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
	if (!locals.user || !can(locals.user.role, capability)) throw new Error('FORBIDDEN');
}
export function requireAdmin(locals: App.Locals): void {
	if (locals.user?.role !== 'admin') throw new Error('FORBIDDEN');
}
