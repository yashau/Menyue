import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { requireCsrf, sha256 } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.counter) throw error(401, 'Counter authentication is required.');
	await requireCsrf(event);
	const token = event.cookies.get('menyue_session');
	if (token)
		await event.platform!.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
	event.cookies.delete('menyue_session', { path: '/' });
	event.cookies.delete('menyue_csrf', { path: '/' });
	throw redirect(303, '/counter/login');
};
