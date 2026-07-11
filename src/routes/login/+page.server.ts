import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDB, PRIMARY_RESTAURANT_ID } from '$lib/server/db';
import { login, setSessionCookie } from '$lib/server/auth';

function homeFor(role: string): string {
	return role === 'counter' ? '/counter' : '/admin';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, url.searchParams.get('next') || homeFor(locals.user.role));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, platform, url }) => {
		const db = getDB(platform);
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!username || !password) {
			return fail(400, { error: 'Enter your username and password.', username });
		}
		const result = await login(db, PRIMARY_RESTAURANT_ID, username, password);
		if (!result) {
			return fail(401, { error: 'Incorrect username or password.', username });
		}
		setSessionCookie(cookies, result.token, url.protocol === 'https:');
		const next = url.searchParams.get('next');
		// resolve role for redirect
		const role = (await db.prepare('SELECT role FROM users WHERE restaurant_id = ? AND username = ?').bind(PRIMARY_RESTAURANT_ID, username).first<{ role: string }>())?.role ?? 'counter';
		throw redirect(303, next || homeFor(role));
	}
};
