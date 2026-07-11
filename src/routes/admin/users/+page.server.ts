import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDB } from '$lib/server/db';
import { assertCsrf, hashPassword, requireAdmin } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals.user); // managers get a genuine 403
	const db = getDB(platform);
	const rows = await db
		.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE restaurant_id = ? ORDER BY role, username')
		.bind(locals.restaurantId)
		.all<{ id: number; username: string; display_name: string; role: string; created_at: number }>();
	return { users: rows.results };
};

export const actions: Actions = {
	create: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const username = String(form.get('username') ?? '').trim().toLowerCase();
		const displayName = String(form.get('displayName') ?? '').trim();
		const role = String(form.get('role') ?? '');
		const password = String(form.get('password') ?? '');
		if (!username || !displayName || !['admin', 'manager', 'counter'].includes(role)) return fail(400, { error: 'All fields required' });
		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters' });
		const { hash, salt } = await hashPassword(password);
		try {
			await db.prepare('INSERT INTO users (restaurant_id, username, display_name, role, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())').bind(user.restaurantId, username, displayName, role, hash, salt).run();
		} catch {
			return fail(400, { error: 'That username already exists' });
		}
		await db.prepare("INSERT INTO audit_log (restaurant_id, actor, action, entity_type, detail, created_at) VALUES (?, ?, 'user.create', 'user', ?, unixepoch())").bind(user.restaurantId, user.username, JSON.stringify({ username, role })).run();
		return { saved: true };
	},
	resetPassword: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		const password = String(form.get('password') ?? '');
		if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters' });
		const { hash, salt } = await hashPassword(password);
		await db.prepare('UPDATE users SET password_hash=?, password_salt=? WHERE id=? AND restaurant_id=?').bind(hash, salt, id, user.restaurantId).run();
		await db.prepare("INSERT INTO audit_log (restaurant_id, actor, action, entity_type, entity_id, created_at) VALUES (?, ?, 'user.reset_pw', 'user', ?, unixepoch())").bind(user.restaurantId, user.username, id).run();
		return { saved: true, reset: id };
	},
	remove: async ({ request, locals, platform }) => {
		const user = requireAdmin(locals.user);
		const db = getDB(platform);
		const form = await request.formData();
		assertCsrf(user, String(form.get('csrf')));
		const id = Number(form.get('id'));
		if (id === user.id) return fail(400, { error: 'You cannot delete your own account' });
		await db.prepare('DELETE FROM users WHERE id=? AND restaurant_id=?').bind(id, user.restaurantId).run();
		return { saved: true };
	}
};
