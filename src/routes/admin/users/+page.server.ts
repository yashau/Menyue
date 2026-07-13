import { fail, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/permissions';
import { passwordHash, requireCsrf } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';
const pepper = (e: Parameters<NonNullable<Actions['create']>>[0]) => {
	const p = (e.platform!.env as unknown as { AUTH_PEPPER?: string }).AUTH_PEPPER;
	if (!p) throw error(500, 'AUTH_PEPPER is required');
	return p;
};
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	return {
		users: (
			await platform!.env.DB.prepare(
				'SELECT id,username,display_name,role,enabled,must_change_password FROM users ORDER BY username',
			).all()
		).results,
	};
};
export const actions: Actions = {
	create: async (e) => {
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			role = String(f.get('role'));
		if (role !== 'admin' && role !== 'manager') return fail(400, { message: 'Invalid role' });
		const p = await passwordHash(String(f.get('password')), undefined, 210000, pepper(e));
		const id = crypto.randomUUID();
		await e
			.platform!.env.DB.prepare(
				'INSERT INTO users(id,username,display_name,role,password_hash,salt,iterations,must_change_password) VALUES(?,?,?,?,?,?,?,1)',
			)
			.bind(
				id,
				String(f.get('username')).toLowerCase(),
				String(f.get('name')),
				role,
				p.hash,
				p.salt,
				p.iterations,
			)
			.run();
		await audit(e.platform!.env.DB, e.locals.user!.id, 'user.created', 'user', id, { role, username: String(f.get('username')).toLowerCase() });
	},
	update: async (e) => {
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			id = String(f.get('id')),
			role = String(f.get('role')),
			enabled = f.get('enabled') === 'on';
		if (role !== 'admin' && role !== 'manager') return fail(400, { message: 'Invalid role' });
		const current = await e
			.platform!.env.DB.prepare('SELECT role,enabled FROM users WHERE id=?')
			.bind(id)
			.first<{ role: string; enabled: number }>();
		if (!current) return fail(404);
		const removesActiveAdmin =
			current.role === 'admin' && current.enabled === 1 && (!enabled || role !== 'admin');
		let result: D1Result;
		try {
			result = removesActiveAdmin
				? (
						await e.platform!.env.DB.batch([
							e.platform!.env.DB.prepare('UPDATE admin_mutation_lock SET version=version+1 WHERE id=1'),
							e.platform!.env.DB
								.prepare(
									"UPDATE users SET role=?,enabled=?,auth_version=auth_version+1 WHERE id=? AND EXISTS(SELECT 1 FROM users other WHERE other.role='admin' AND other.enabled=1 AND other.id!=?)",
								)
								.bind(role, enabled ? 1 : 0, id, id),
						])
					)[1]
				: await e
						.platform!.env.DB.prepare(
							'UPDATE users SET role=?,enabled=?,auth_version=auth_version+1 WHERE id=?',
						)
						.bind(role, enabled ? 1 : 0, id)
						.run();
		} catch (cause) {
			if (removesActiveAdmin && cause instanceof Error && cause.message.includes('Keep one enabled admin'))
				return fail(409, { message: 'Keep one enabled admin' });
			throw cause;
		}
		if (!result.meta.changes) return fail(409, { message: 'Keep one enabled admin' });
		await e
			.platform!.env.DB.prepare(
				"DELETE FROM sessions WHERE principal_id=? AND principal_type='user'",
			)
			.bind(id)
			.run();
		await audit(e.platform!.env.DB, e.locals.user!.id, 'user.role.updated', 'user', id, { role, enabled });
	},
	reset: async (e) => {
		requireAdmin(e.locals);
		await requireCsrf(e);
		const f = await e.request.formData(),
			p = await passwordHash(String(f.get('password')), undefined, 210000, pepper(e));
		await e
			.platform!.env.DB.prepare(
				'UPDATE users SET password_hash=?,salt=?,iterations=?,must_change_password=1,auth_version=auth_version+1 WHERE id=?',
			)
			.bind(p.hash, p.salt, p.iterations, String(f.get('id')))
			.run();
		await e
			.platform!.env.DB.prepare(
				"DELETE FROM sessions WHERE principal_id=? AND principal_type='user'",
			)
			.bind(String(f.get('id')))
			.run();
		await audit(e.platform!.env.DB, e.locals.user!.id, 'user.password.reset', 'user', String(f.get('id')));
	},
};
