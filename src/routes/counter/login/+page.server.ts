import { fail, redirect } from '@sveltejs/kit';
import { createSession, secureCookie, verifyPassword } from '$lib/server/auth';
import type { Actions } from './$types';
export const actions: Actions = {
	default: async (event) => {
		const f = await event.request.formData(),
			password = String(f.get('password') ?? ''),
			pepper = (event.platform!.env as unknown as { AUTH_PEPPER?: string }).AUTH_PEPPER ?? '',
			credential = await event
				.platform!.env.DB.prepare(
					'SELECT password_hash,salt,iterations,auth_version FROM counter_credentials WHERE id=1',
				)
				.first<{ password_hash: string; salt: string; iterations: number; auth_version: number }>();
		if (
			!pepper ||
			!credential ||
			!(await verifyPassword(
				password,
				{
					hash: credential.password_hash,
					salt: credential.salt,
					iterations: credential.iterations,
				},
				pepper,
			))
		)
			return fail(401, { message: 'Invalid counter password.' });
		const session = await createSession(
			event.platform!.env.DB,
			'counter',
			'counter',
			credential.auth_version,
		);
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
		throw redirect(303, '/counter');
	},
};
