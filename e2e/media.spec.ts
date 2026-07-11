import { test, expect } from '@playwright/test';
import { login } from './helpers';

// A tiny valid PNG (1x1) — enough to exercise the crop → upload → R2 pipeline.
const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

test('admin uploads an item photo → stored in R2 → served & displayed', async ({ page }) => {
	await login(page, 'admin');
	await page.goto('/admin/menu', { waitUntil: 'networkidle' });

	// open the first item's editor
	await page.getByRole('button', { name: /^Edit / }).first().click();
	const editDialog = page.getByRole('dialog');
	await expect(editDialog).toBeVisible();

	// open the cropper and provide a file
	await page.getByRole('button', { name: /Upload photo|Change photo/ }).click();
	await page.setInputFiles('input[type="file"]', {
		name: 'photo.png',
		mimeType: 'image/png',
		buffer: PNG_1x1
	});

	// crop UI appears; apply → uploads to R2
	const usePhoto = page.getByRole('button', { name: 'Use photo' });
	await expect(usePhoto).toBeVisible();
	await page.waitForTimeout(400); // let the image load & fit
	await usePhoto.click();

	// back on the editor, the photo is now set
	await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Save item' }).click();
	await page.waitForTimeout(400);

	// reload fresh and confirm the first row renders an R2-backed /media/ image
	await page.goto('/admin/menu', { waitUntil: 'networkidle' });
	const src = await page.getByTestId('admin-item-row').first().locator('img').getAttribute('src');
	expect(src, 'row image should be served from R2').toContain('/media/items/');

	// and that media URL actually serves the bytes from R2
	const res = await page.request.get(src!);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type'] ?? '').toMatch(/image\//);
});
