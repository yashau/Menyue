import type { D1Database } from '@cloudflare/workers-types';
import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import type { Role } from '$lib/types';

export const SESSION_COOKIE = 'menyue_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface SessionUser {
	id: number;
	username: string;
	displayName: string;
	role: Role;
	restaurantId: number;
	sessionId: string;
	csrfSecret: string;
}

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function randomToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return toHex(buf);
}

const PBKDF2_ITERATIONS = 120_000;

async function derive(password: string, salt: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		key,
		256
	);
	return toHex(new Uint8Array(bits));
}

export async function hashPassword(
	password: string
): Promise<{ hash: string; salt: string }> {
	const saltBytes = new Uint8Array(16);
	crypto.getRandomValues(saltBytes);
	const hash = await derive(password, saltBytes);
	return { hash, salt: toHex(saltBytes) };
}

export async function verifyPassword(
	password: string,
	salt: string,
	expectedHash: string
): Promise<boolean> {
	const actual = await derive(password, fromHex(salt));
	// constant-time-ish comparison
	if (actual.length !== expectedHash.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
	return diff === 0;
}

interface UserRow {
	id: number;
	username: string;
	display_name: string;
	role: Role;
	restaurant_id: number;
	password_hash: string;
	password_salt: string;
}

export async function login(
	db: D1Database,
	restaurantId: number,
	username: string,
	password: string
): Promise<{ token: string; csrf: string } | null> {
	const row = await db
		.prepare(
			`SELECT id, username, display_name, role, restaurant_id, password_hash, password_salt
			 FROM users WHERE restaurant_id = ? AND username = ?`
		)
		.bind(restaurantId, username)
		.first<UserRow>();
	if (!row) return null;
	const ok = await verifyPassword(password, row.password_salt, row.password_hash);
	if (!ok) return null;

	const token = randomToken();
	const csrf = randomToken(16);
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO sessions (id, user_id, restaurant_id, csrf_secret, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(token, row.id, row.restaurant_id, csrf, now, now + SESSION_TTL_SECONDS)
		.run();
	return { token, csrf };
}

export async function resolveSession(
	db: D1Database,
	token: string | undefined
): Promise<SessionUser | null> {
	if (!token) return null;
	const now = Math.floor(Date.now() / 1000);
	const row = await db
		.prepare(
			`SELECT s.id AS session_id, s.csrf_secret, s.expires_at,
			        u.id, u.username, u.display_name, u.role, u.restaurant_id
			 FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.id = ?`
		)
		.bind(token)
		.first<{
			session_id: string;
			csrf_secret: string;
			expires_at: number;
			id: number;
			username: string;
			display_name: string;
			role: Role;
			restaurant_id: number;
		}>();
	if (!row) return null;
	if (row.expires_at < now) {
		await db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
		return null;
	}
	return {
		id: row.id,
		username: row.username,
		displayName: row.display_name,
		role: row.role,
		restaurantId: row.restaurant_id,
		sessionId: row.session_id,
		csrfSecret: row.csrf_secret
	};
}

export async function logout(db: D1Database, token: string | undefined): Promise<void> {
	if (!token) return;
	await db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
}

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: SESSION_TTL_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

// ---- Authorization guards ----

export function requireUser(user: SessionUser | null): SessionUser {
	if (!user) throw error(401, 'Sign in required');
	return user;
}

export function requireRole(user: SessionUser | null, ...roles: Role[]): SessionUser {
	const u = requireUser(user);
	if (!roles.includes(u.role)) {
		throw error(403, 'You do not have permission to perform this action');
	}
	return u;
}

// Manager OR admin can edit the menu; admin-only for global settings.
export const requireMenuEditor = (u: SessionUser | null) => requireRole(u, 'admin', 'manager');
export const requireAdmin = (u: SessionUser | null) => requireRole(u, 'admin');
export const requireCounter = (u: SessionUser | null) => requireRole(u, 'admin', 'manager', 'counter');

// CSRF: authenticated mutating requests must echo the session csrf secret.
export function assertCsrf(user: SessionUser, provided: string | null): void {
	if (!provided || provided !== user.csrfSecret) {
		throw error(403, 'Invalid or missing CSRF token');
	}
}
