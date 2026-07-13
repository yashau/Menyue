import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const state = resolve(root, '.wrangler/state');
const token = 'table-one-local';

function d1(command: string) {
	const result = JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'menyue', '--local', '--persist-to', state, '--command', command, '--json'], {
		cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false,
	}));
	if (!result[0]?.success) throw new Error(`D1 command failed: ${command}`);
}

test('suggestion-only configurable items retain their source, while sold-out items stay visible but unavailable', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The shared local D1 fixture is exercised once.');
	d1("UPDATE menu_items SET discoverability='suggestion_only',availability='available' WHERE id='local-item-water'; UPDATE menu_items SET availability='sold_out' WHERE id='local-item-fries';");
	try {
		await page.goto(`/t/${token}`);
		await expect(page.getByTestId('dish-local-item-water')).toBeHidden();
		await expect(page.getByTestId('dish-local-item-fries')).toBeVisible();
		await expect(page.getByTestId('add-local-item-fries')).toBeDisabled();

		await page.getByTestId('add-local-item-burger').click();
		await page.getByTestId('choice-local-choice-salad').check();
		await page.getByTestId('draft-next').click();
		await page.getByTestId('suggestion-add-local-item-water').click();
		await expect(page.getByTestId('modifier-local-item-water')).toBeVisible();
		await page.getByTestId('choice-local-choice-water-room').check();
		await page.getByTestId('draft-next').click();
		await page.getByTestId('draft-review').click();
		const request = page.waitForRequest((candidate) => candidate.url().includes(`/api/tables/${token}/orders`) && candidate.method() === 'POST');
		await page.getByTestId('draft-commit').click();
		await page.getByTestId('submit-order').click();
		const payload = (await request).postDataJSON() as { lines: Array<{ itemId: string; suggestedFromItemId?: string }> };
		expect(payload.lines).toContainEqual({ itemId: 'local-item-water', quantity: 1, choiceIds: ['local-choice-water-room'], suggestedFromItemId: 'local-item-burger' });

		const forgedStatus = await page.evaluate(async (orderToken) => (await fetch(`/api/tables/${orderToken}/orders`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
				idempotencyKey: crypto.randomUUID(), lines: [{ itemId: 'local-item-water', quantity: 1, choiceIds: [] }],
			}),
		})).status, token);
		expect(forgedStatus).toBe(409);
	} finally {
		d1("UPDATE menu_items SET discoverability='browse',availability='available' WHERE id IN ('local-item-water','local-item-fries');");
	}
});
