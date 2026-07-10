import { error, redirect } from '@sveltejs/kit';
import type { Role } from '$lib/types';

const encoder = new TextEncoder();
const token = () => crypto.getRandomValues(new Uint8Array(32));
export const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
export async function sha256(value: string): Promise<string> {
	return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export async function passwordHash(
	password: string,
	salt = base64url(token()),
	iterations = 210_000,
	pepper = '',
): Promise<{ hash: string; salt: string; iterations: number }> {
	if (password.length < 12 || password.length > 128)
		throw new Error('Password must be 12–128 characters.');
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password + pepper),
		'PBKDF2',
		false,
		['deriveBits'],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
		key,
		256,
	);
	return { hash: base64url(new Uint8Array(bits)), salt, iterations };
}
export async function verifyPassword(
	password: string,
	stored: { hash: string; salt: string; iterations: number },
	pepper = '',
): Promise<boolean> {
	if (password.length < 12 || password.length > 128) return false;
	const candidate = (await passwordHash(password, stored.salt, stored.iterations, pepper)).hash;
	const a = encoder.encode(candidate),
		b = encoder.encode(stored.hash);
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
	return result === 0;
}
export async function createSession(
	db: D1Database,
	principalType: 'user' | 'counter',
	principalId: string,
	authVersion: number,
): Promise<{ token: string; csrf: string }> {
	const value = base64url(token()),
		csrf = base64url(token()),
		id = crypto.randomUUID();
	const now = Date.now(),
		expires = new Date(now + 8 * 60 * 60_000).toISOString(),
		absolute = new Date(now + 24 * 60 * 60_000).toISOString();
	await db
		.prepare(
			'INSERT INTO sessions(id,token_hash,principal_type,principal_id,auth_version,csrf_hash,expires_at,absolute_expires_at) VALUES(?,?,?,?,?,?,?,?)',
		)
		.bind(
			id,
			await sha256(value),
			principalType,
			principalId,
			authVersion,
			await sha256(csrf),
			expires,
			absolute,
		)
		.run();
	return { token: value, csrf };
}
export function secureCookie(event: { url: URL }) {
	return event.url.protocol === 'https:';
}
export function deny(status = 403): never {
	throw error(status, 'You do not have permission to do that.');
}
export function safeReturn(value: string | null): string {
	return value?.startsWith('/') && !value.startsWith('//') ? value : '/admin';
}
export async function requireCsrf(event: {
	request: Request;
	cookies: { get(name: string): string | undefined };
	locals: App.Locals;
}): Promise<void> {
	const supplied = event.request.headers.get('x-csrf-token') ?? event.cookies.get('menyue_csrf');
	const expected = event.locals.user?.csrf ?? event.locals.counter?.csrf;
	if (!supplied || !expected || (await sha256(supplied)) !== expected)
		throw error(403, 'Invalid CSRF token.');
}
export function requireUser(locals: App.Locals): asserts locals is App.Locals & {
	user: { id: string; role: Role; username: string; csrf: string };
} {
	if (!locals.user) throw redirect(303, '/admin/login');
}
