import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sha256 } from '$lib/server/auth';
export const POST: RequestHandler = async ({ cookies, platform }) => {
	const token = cookies.get('menyue_session');
	if (token)
		await platform!.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
			.bind(await sha256(token))
			.run();
	cookies.delete('menyue_session', { path: '/' });
	cookies.delete('menyue_csrf', { path: '/' });
	throw redirect(303, '/admin/login');
};
