import { fail, redirect } from '@sveltejs/kit';
import { passwordHash, requireCsrf, requireUser } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		requireUser(event.locals);
		await requireCsrf(event);
		const form = await event.request.formData(),
			password = String(form.get('password') ?? ''),
			confirm = String(form.get('confirm') ?? '');
		if (password !== confirm) return fail(400, { message: 'Passwords do not match.' });
		let next;
		try {
			next = await passwordHash(password, undefined, 210_000, event.platform!.env.AUTH_PEPPER);
		} catch (cause) {
			return fail(400, { message: cause instanceof Error ? cause.message : 'Invalid password.' });
		}
		await event.platform!.env.DB.batch([
			event
				.platform!.env.DB.prepare(
					'UPDATE users SET password_hash=?,salt=?,iterations=?,must_change_password=0,auth_version=auth_version+1 WHERE id=?',
				)
				.bind(next.hash, next.salt, next.iterations, event.locals.user.id),
			event
				.platform!.env.DB.prepare(
					"DELETE FROM sessions WHERE principal_type='user' AND principal_id=?",
				)
				.bind(event.locals.user.id),
		]);
		await audit(event.platform!.env.DB, event.locals.user.id, 'user.password.changed', 'user', event.locals.user.id);
		event.cookies.delete('menyue_session', { path: '/' });
		event.cookies.delete('menyue_csrf', { path: '/' });
		throw redirect(303, '/admin/login');
	},
};
