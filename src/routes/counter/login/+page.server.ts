import { fail, redirect } from '@sveltejs/kit';
import { createSession, secureCookie, verifyPassword } from '$lib/server/auth';
import { restaurantId } from '$lib/server/restaurant';
import type { Actions } from './$types';
export const actions: Actions = {
	default: async (event) => {
		const f = await event.request.formData(),
			username = String(f.get('username') ?? '').trim().toLowerCase(),
			password = String(f.get('password') ?? ''),
			pepper = (event.platform!.env as unknown as { AUTH_PEPPER?: string }).AUTH_PEPPER ?? '',
			operator = await event
				.platform!.env.DB.prepare(
					'SELECT id,password_hash,salt,iterations,auth_version,enabled FROM counter_operators WHERE restaurant_id=? AND normalized_username=?',
				)
				.bind(restaurantId(event.platform!.env), username)
				.first<{ id: string; password_hash: string; salt: string; iterations: number; auth_version: number; enabled: number }>();
		if (
			!pepper ||
			!operator ||
			!operator.enabled ||
			!(await verifyPassword(
				password,
				{
					hash: operator.password_hash,
					salt: operator.salt,
					iterations: operator.iterations,
				},
				pepper,
			))
		)
			return fail(401, { message: 'Invalid counter password.' });
		const session = await createSession(
			event.platform!.env.DB,
			'counter', operator.id, operator.auth_version,
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
