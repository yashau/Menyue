import type { Page } from '@playwright/test';

// Deterministic seed token for Table 1 (see scripts/seed.mjs detHex).
export const TABLE1 = 'tbl_01_3c47d1aa629f57a3';

export const CREDENTIALS = {
	admin: { username: 'admin', password: 'menyue-admin' },
	manager: { username: 'manager', password: 'menyue-manager' },
	counter: { username: 'counter', password: 'menyue-counter' }
};

export async function login(page: Page, role: keyof typeof CREDENTIALS) {
	const { username, password } = CREDENTIALS[role];
	// networkidle ensures client hydration finished before we interact.
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.fill('input[name="username"]', username);
	await page.fill('input[name="password"]', password);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/(admin|counter)/, { timeout: 15_000 });
}

// The supported responsive widths from the engineering contract.
export const WIDTHS = [320, 375, 390, 412, 768, 1440];
