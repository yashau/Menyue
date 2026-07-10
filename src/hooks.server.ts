import { redirect, type Handle } from '@sveltejs/kit';
import { sha256 } from '$lib/server/auth';
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('menyue_session');
	if (token)
		try {
			const session = await event
				.platform!.env.DB.prepare(
					'SELECT principal_type, principal_id, auth_version, csrf_hash FROM sessions WHERE token_hash=? AND expires_at > CURRENT_TIMESTAMP AND absolute_expires_at > CURRENT_TIMESTAMP',
				)
				.bind(await sha256(token))
				.first<{
					principal_type: 'user' | 'counter';
					principal_id: string;
					auth_version: number;
					csrf_hash: string;
				}>();
			if (session?.principal_type === 'user') {
				const user = await event
					.platform!.env.DB.prepare(
						'SELECT id,username,role,enabled,auth_version,must_change_password FROM users WHERE id=?',
					)
					.bind(session.principal_id)
					.first<{
						id: string;
						username: string;
						role: 'admin' | 'manager';
						enabled: number;
						auth_version: number;
						must_change_password: number;
					}>();
				if (user?.enabled && user.auth_version === session.auth_version)
					event.locals.user = {
						id: user.id,
						username: user.username,
						role: user.role,
						csrf: session.csrf_hash,
						mustChange: user.must_change_password === 1,
					};
			} else if (session?.principal_type === 'counter')
				event.locals.counter = { csrf: session.csrf_hash };
		} catch {
			event.cookies.delete('menyue_session', { path: '/' });
		}
	if (
		event.locals.user?.mustChange &&
		event.url.pathname.startsWith('/admin') &&
		!['/admin/change-password', '/admin/logout'].includes(event.url.pathname)
	)
		throw redirect(303, '/admin/change-password');
	const response = await resolve(event);
	if (
		event.url.pathname.startsWith('/admin') ||
		event.url.pathname.startsWith('/counter') ||
		event.url.pathname.startsWith('/t/')
	) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('X-Robots-Tag', 'noindex');
	}
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	return response;
};
