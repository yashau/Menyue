import { fail, error } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { passwordHash, requireCsrf } from '$lib/server/auth';
import { requireAdmin } from '$lib/server/permissions';
import { restaurantId } from '$lib/server/restaurant';
import type { Actions, PageServerLoad } from './$types';

const operatorName = (value: FormDataEntryValue | null) => String(value ?? '').trim().toLowerCase();
const displayName = (value: FormDataEntryValue | null) => String(value ?? '').trim();
const validUsername = (value: string) => /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value);

const pepper = (event: Parameters<NonNullable<Actions['create']>>[0]) => {
	const value = (event.platform!.env as { AUTH_PEPPER?: string }).AUTH_PEPPER;
	if (!value) throw error(500, 'AUTH_PEPPER is required');
	return value;
};
const guard = async (event: Parameters<NonNullable<Actions['create']>>[0]) => {
	requireAdmin(event.locals);
	await requireCsrf(event);
	return { db: event.platform!.env.DB, restaurant: restaurantId(event.platform!.env) };
};
const ownedOperator = async (db: D1Database, restaurant: string, id: string) =>
	db
		.prepare('SELECT id,display_name FROM counter_operators WHERE id=? AND restaurant_id=?')
		.bind(id, restaurant)
		.first<{ id: string; display_name: string }>();

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const restaurant = restaurantId(platform!.env);
	return {
		operators: (
			await platform!.env.DB
				.prepare(
					'SELECT id,normalized_username,display_name,enabled,created_at,updated_at FROM counter_operators WHERE restaurant_id=? ORDER BY normalized_username,id',
				)
				.bind(restaurant)
				.all()
		).results,
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { db, restaurant } = await guard(event);
		const form = await event.request.formData();
		const username = operatorName(form.get('username'));
		const name = displayName(form.get('displayName'));
		if (!validUsername(username) || !name || name.length > 100)
			return fail(400, { message: 'Use a 3–64 character username and a display name up to 100 characters.' });
		let credential;
		try {
			credential = await passwordHash(String(form.get('password') ?? ''), undefined, 210_000, pepper(event));
		} catch (cause) {
			return fail(400, { message: cause instanceof Error ? cause.message : 'Invalid password.' });
		}
		const id = crypto.randomUUID();
		try {
			await db
				.prepare(
					'INSERT INTO counter_operators(id,restaurant_id,normalized_username,display_name,password_hash,salt,iterations) VALUES(?,?,?,?,?,?,?)',
				)
				.bind(id, restaurant, username, name, credential.hash, credential.salt, credential.iterations)
				.run();
		} catch (cause) {
			if (cause instanceof Error && cause.message.includes('UNIQUE'))
				return fail(409, { message: 'That counter username is already in use.' });
			throw cause;
		}
		await audit(db, event.locals.user!.id, 'counter_operator.created', 'counter_operator', id, { restaurant, username });
	},
	setEnabled: async (event) => {
		const { db, restaurant } = await guard(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const enabled = form.get('enabled') === 'true';
		const operator = await ownedOperator(db, restaurant, id);
		if (!operator) return fail(404, { message: 'Counter operator not found.' });
		await db.batch([
			db.prepare('UPDATE counter_operators SET enabled=?,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(enabled ? 1 : 0, id, restaurant),
			db.prepare("DELETE FROM sessions WHERE principal_type='counter' AND principal_id=?").bind(id),
		]);
		await audit(db, event.locals.user!.id, enabled ? 'counter_operator.enabled' : 'counter_operator.disabled', 'counter_operator', id, { restaurant });
	},
	reset: async (event) => {
		const { db, restaurant } = await guard(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		if (!(await ownedOperator(db, restaurant, id))) return fail(404, { message: 'Counter operator not found.' });
		let credential;
		try {
			credential = await passwordHash(String(form.get('password') ?? ''), undefined, 210_000, pepper(event));
		} catch (cause) {
			return fail(400, { message: cause instanceof Error ? cause.message : 'Invalid password.' });
		}
		await db.batch([
			db.prepare('UPDATE counter_operators SET password_hash=?,salt=?,iterations=?,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(credential.hash, credential.salt, credential.iterations, id, restaurant),
			db.prepare("DELETE FROM sessions WHERE principal_type='counter' AND principal_id=?").bind(id),
		]);
		await audit(db, event.locals.user!.id, 'counter_operator.password.reset', 'counter_operator', id, { restaurant });
	},
	revoke: async (event) => {
		const { db, restaurant } = await guard(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!(await ownedOperator(db, restaurant, id))) return fail(404, { message: 'Counter operator not found.' });
		await db.prepare("DELETE FROM sessions WHERE principal_type='counter' AND principal_id=?").bind(id).run();
		await audit(db, event.locals.user!.id, 'counter_operator.sessions.revoked', 'counter_operator', id, { restaurant });
	},
};
