import { fail, redirect } from '@sveltejs/kit';
import { createSession, safeReturn, secureCookie, verifyPassword } from '$lib/server/auth';
import type { Actions } from './$types';
export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData(),
			username = String(form.get('username') ?? '')
				.trim()
				.toLowerCase(),
			password = String(form.get('password') ?? ''),
			pepper = (event.platform!.env as unknown as { AUTH_PEPPER?: string }).AUTH_PEPPER ?? '';
		const user = await event
			.platform!.env.DB.prepare(
				'SELECT id,username,role,password_hash,salt,iterations,auth_version,enabled FROM users WHERE username=?',
			)
			.bind(username)
			.first<{
				id: string;
				username: string;
				role: 'admin' | 'manager';
				password_hash: string;
				salt: string;
				iterations: number;
				auth_version: number;
				enabled: number;
			}>();
		if (
			!user?.enabled ||
			!(await verifyPassword(
				password,
				{ hash: user.password_hash, salt: user.salt, iterations: user.iterations },
				pepper,
			))
		)
			return fail(401, { message: 'Invalid username or password.' });
		const session = await createSession(event.platform!.env.DB, 'user', user.id, user.auth_version);
		event.cookies.set('menyue_session', session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: secureCookie(event),
			maxAge: 86400,
		});
		event.cookies.set('menyue_csrf', session.csrf, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			secure: secureCookie(event),
			maxAge: 86400,
		});
		throw redirect(303, safeReturn(event.url.searchParams.get('returnTo')));
	},
};
