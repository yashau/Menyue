import { redirect, type RequestHandler } from '@sveltejs/kit';
import { requireCsrf, requireUser, sha256 } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
export const POST: RequestHandler = async (event) => {
	const { cookies, platform, locals } = event;
	requireUser(locals);
	await requireCsrf(event);
	const token = cookies.get('menyue_session');
	if (token)
		await platform!.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
			.bind(await sha256(token))
			.run();
	await audit(platform!.env.DB, locals.user.id, 'auth.logout', 'user', locals.user.id);
	cookies.delete('menyue_session', { path: '/' });
	cookies.delete('menyue_csrf', { path: '/' });
	throw redirect(303, '/admin/login');
};
