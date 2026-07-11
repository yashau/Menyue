import type { D1Database } from '@cloudflare/workers-types';
import type { CurrencyFormat } from '$lib/money';
import type { DisplayCurrency, RateInfo, Restaurant } from '$lib/types';
import { randomToken } from './auth';

export const FRESH_WINDOW_SECONDS = 24 * 60 * 60; // rates considered fresh for 24h
export const MAX_GOOD_WINDOW_SECONDS = 72 * 60 * 60; // last-known-good usable up to 72h
const LEASE_SECONDS = 30;
const MAX_RATE = 1_000_000; // sanity bound on a single rate
const MAX_RESPONSE_BYTES = 256 * 1024;

// The single allowlisted public provider. No admin-configurable URL.
const PROVIDER_NAME = 'open.er-api.com';
const providerUrl = (base: string) => `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;

interface RestaurantRow {
	id: number;
	name: string;
	slug: string;
	base_code: string;
	base_symbol: string;
	base_precision: number;
	base_symbol_position: 'before' | 'after';
	settings_revision: number;
	multi_currency_enabled: number;
	conversion_mode: 'fixed' | 'api';
	beverage_prompt_enabled: number;
	beverage_prompt_heading: string;
	beverage_prompt_body: string;
	beverage_prompt_skip_label: string;
	theme_primary: string;
	theme_accent: string;
	logo_key: string | null;
	app_origin: string | null;
}

export function restaurantBaseFormat(r: Restaurant): CurrencyFormat {
	return r.base;
}

export async function getRestaurant(db: D1Database, id: number): Promise<Restaurant> {
	const row = await db.prepare('SELECT * FROM restaurants WHERE id = ?').bind(id).first<RestaurantRow>();
	if (!row) throw new Error('Restaurant not found');
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		base: {
			code: row.base_code,
			symbol: row.base_symbol,
			precision: row.base_precision,
			symbolPosition: row.base_symbol_position
		},
		settingsRevision: row.settings_revision,
		multiCurrencyEnabled: !!row.multi_currency_enabled,
		conversionMode: row.conversion_mode,
		beveragePrompt: {
			enabled: !!row.beverage_prompt_enabled,
			heading: row.beverage_prompt_heading,
			body: row.beverage_prompt_body,
			skipLabel: row.beverage_prompt_skip_label
		},
		theme: {
			primary: row.theme_primary,
			accent: row.theme_accent
		},
		logoKey: row.logo_key,
		appOrigin: row.app_origin
	};
}

interface CurrencyRow {
	id: number;
	code: string;
	symbol: string;
	precision: number;
	symbol_position: 'before' | 'after';
	display_order: number;
	enabled: number;
	mode: 'fixed' | 'api';
	fixed_rate: number | null;
	fallback_rate: number;
}

export async function getDisplayCurrencies(
	db: D1Database,
	restaurantId: number,
	includeDisabled = false
): Promise<DisplayCurrency[]> {
	const rows = await db
		.prepare(
			`SELECT * FROM currencies WHERE restaurant_id = ? ${includeDisabled ? '' : 'AND enabled = 1'} ORDER BY display_order, code`
		)
		.bind(restaurantId)
		.all<CurrencyRow>();
	return rows.results.map((c) => ({
		id: c.id,
		code: c.code,
		symbol: c.symbol,
		precision: c.precision,
		symbolPosition: c.symbol_position,
		displayOrder: c.display_order,
		enabled: !!c.enabled,
		mode: c.mode,
		fixedRate: c.fixed_rate,
		fallbackRate: c.fallback_rate
	}));
}

interface CacheRow {
	code: string;
	rate: number;
	provider: string;
	fetched_at: number;
}

// Cache-only rate resolution. Never performs network I/O — safe for every
// menu render. Freshness is derived from the cache timestamp; when no usable
// cached rate exists the fixed/fallback rate is used.
export async function resolveRates(
	db: D1Database,
	restaurant: Restaurant,
	currencies: DisplayCurrency[]
): Promise<Map<string, RateInfo>> {
	const now = Math.floor(Date.now() / 1000);
	const cacheRows = await db
		.prepare('SELECT code, rate, provider, fetched_at FROM rate_cache WHERE restaurant_id = ? AND base_code = ?')
		.bind(restaurant.id, restaurant.base.code)
		.all<CacheRow>();
	const cache = new Map(cacheRows.results.map((r) => [r.code, r]));

	const out = new Map<string, RateInfo>();
	// Base currency always maps 1:1.
	out.set(restaurant.base.code, {
		code: restaurant.base.code,
		rate: 1,
		provider: 'base',
		freshness: 'fixed',
		fetchedAt: null
	});

	for (const c of currencies) {
		const useFixed = restaurant.conversionMode === 'fixed' || c.mode === 'fixed';
		if (useFixed) {
			out.set(c.code, {
				code: c.code,
				rate: c.fixedRate ?? c.fallbackRate,
				provider: 'fixed',
				freshness: 'fixed',
				fetchedAt: null
			});
			continue;
		}
		const cached = cache.get(c.code);
		if (cached && now - cached.fetched_at <= MAX_GOOD_WINDOW_SECONDS) {
			const fresh = now - cached.fetched_at <= FRESH_WINDOW_SECONDS;
			out.set(c.code, {
				code: c.code,
				rate: cached.rate,
				provider: cached.provider,
				freshness: fresh ? 'fresh' : 'stale',
				fetchedAt: cached.fetched_at
			});
		} else {
			out.set(c.code, {
				code: c.code,
				rate: c.fallbackRate,
				provider: 'fallback',
				freshness: 'fallback',
				fetchedAt: cached?.fetched_at ?? null
			});
		}
	}
	return out;
}

// Attempt to atomically acquire the per-restaurant refresh lease.
async function acquireLease(db: D1Database, restaurantId: number): Promise<string | null> {
	const owner = randomToken(8);
	const now = Math.floor(Date.now() / 1000);
	const expires = now + LEASE_SECONDS;
	const res = await db
		.prepare(
			`INSERT INTO rate_lease (restaurant_id, owner, expires_at) VALUES (?, ?, ?)
			 ON CONFLICT(restaurant_id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
			 WHERE rate_lease.expires_at < ?
			 RETURNING owner`
		)
		.bind(restaurantId, owner, expires, now)
		.first<{ owner: string }>();
	return res?.owner === owner ? owner : null;
}

async function releaseLease(db: D1Database, restaurantId: number, owner: string): Promise<void> {
	await db
		.prepare('DELETE FROM rate_lease WHERE restaurant_id = ? AND owner = ?')
		.bind(restaurantId, owner)
		.run();
}

export interface RefreshResult {
	ok: boolean;
	updated: string[];
	reason?: string;
	provider: string;
}

// Explicit provider refresh under an atomic lease. Validates provider payload
// (success flag, matching base code, bounded & finite rates, timestamp) and
// writes the cache. Falls back silently on any failure — callers keep serving
// cache/fallback rates.
export async function refreshRates(
	db: D1Database,
	restaurant: Restaurant,
	currencies: DisplayCurrency[]
): Promise<RefreshResult> {
	if (restaurant.conversionMode === 'fixed') {
		return { ok: false, updated: [], reason: 'Restaurant uses fixed conversion', provider: PROVIDER_NAME };
	}
	const apiCurrencies = currencies.filter((c) => c.mode === 'api');
	if (apiCurrencies.length === 0) {
		return { ok: false, updated: [], reason: 'No API currencies configured', provider: PROVIDER_NAME };
	}

	const owner = await acquireLease(db, restaurant.id);
	if (!owner) {
		return { ok: false, updated: [], reason: 'Refresh already in progress', provider: PROVIDER_NAME };
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 6000);
		let payload: unknown;
		try {
			const res = await fetch(providerUrl(restaurant.base.code), {
				signal: controller.signal,
				headers: { accept: 'application/json' }
			});
			if (!res.ok) return { ok: false, updated: [], reason: `Provider HTTP ${res.status}`, provider: PROVIDER_NAME };
			const text = await res.text();
			if (text.length > MAX_RESPONSE_BYTES) {
				return { ok: false, updated: [], reason: 'Provider response too large', provider: PROVIDER_NAME };
			}
			payload = JSON.parse(text);
		} finally {
			clearTimeout(timeout);
		}

		const p = payload as {
			result?: string;
			base_code?: string;
			time_last_update_unix?: number;
			rates?: Record<string, unknown>;
		};
		if (p.result !== 'success' || p.base_code !== restaurant.base.code || !p.rates) {
			return { ok: false, updated: [], reason: 'Provider payload failed validation', provider: PROVIDER_NAME };
		}
		const fetchedAt =
			typeof p.time_last_update_unix === 'number' && p.time_last_update_unix > 0
				? p.time_last_update_unix
				: Math.floor(Date.now() / 1000);

		const updated: string[] = [];
		const stmts = [];
		for (const c of apiCurrencies) {
			const raw = p.rates[c.code];
			const rate = typeof raw === 'number' ? raw : NaN;
			if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_RATE) continue;
			stmts.push(
				db
					.prepare(
						`INSERT INTO rate_cache (restaurant_id, code, base_code, rate, provider, fetched_at)
						 VALUES (?, ?, ?, ?, ?, ?)
						 ON CONFLICT(restaurant_id, code) DO UPDATE SET
						   base_code = excluded.base_code, rate = excluded.rate,
						   provider = excluded.provider, fetched_at = excluded.fetched_at`
					)
					.bind(restaurant.id, c.code, restaurant.base.code, rate, PROVIDER_NAME, fetchedAt)
			);
			updated.push(c.code);
		}
		if (stmts.length) await db.batch(stmts);
		return { ok: updated.length > 0, updated, provider: PROVIDER_NAME };
	} catch (err) {
		return {
			ok: false,
			updated: [],
			reason: err instanceof Error ? err.message : 'Provider request failed',
			provider: PROVIDER_NAME
		};
	} finally {
		await releaseLease(db, restaurant.id, owner);
	}
}
