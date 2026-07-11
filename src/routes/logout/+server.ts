import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { clearSessionCookie, logout, SESSION_COOKIE } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	const db = getDB(platform);
	await logout(db, cookies.get(SESSION_COOKIE));
	clearSessionCookie(cookies);
	throw redirect(303, '/login');
};
