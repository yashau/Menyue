import { redirect, type Handle } from '@sveltejs/kit';
import { sha256 } from '$lib/server/auth';
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('menyue_session');
	if (token)
		try {
			const tokenHash = await sha256(token);
			const session = await event
				.platform!.env.DB.prepare(
					'SELECT principal_type, principal_id, auth_version, csrf_hash FROM sessions WHERE token_hash=? AND expires_at > CURRENT_TIMESTAMP AND absolute_expires_at > CURRENT_TIMESTAMP',
				)
				.bind(tokenHash)
				.first<{
					principal_type: 'user' | 'counter';
					principal_id: string;
					auth_version: number;
					csrf_hash: string;
				}>();
			let valid = false;
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
				if (user?.enabled && user.auth_version === session.auth_version) {
					valid = true;
					event.locals.user = {
						id: user.id,
						username: user.username,
						role: user.role,
						csrf: session.csrf_hash,
						mustChange: user.must_change_password === 1,
					};
				}
			} else if (session?.principal_type === 'counter') {
				const operator = await event.platform!.env.DB.prepare(
					'SELECT id,restaurant_id,display_name,enabled,auth_version FROM counter_operators WHERE id=?',
				).bind(session.principal_id).first<{
					id: string;
					restaurant_id: string;
					display_name: string;
					enabled: number;
					auth_version: number;
				}>();
				if (operator?.enabled && operator.auth_version === session.auth_version) {
					valid = true;
					event.locals.counter = {
						csrf: session.csrf_hash,
						operatorId: operator.id,
						displayName: operator.display_name,
						restaurantId: operator.restaurant_id,
					};
				}
			}
			if (!valid) {
				await event.platform!.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
				event.cookies.delete('menyue_session', { path: '/' });
				event.cookies.delete('menyue_csrf', { path: '/' });
			}
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
	if (response.status === 101) return response;
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
