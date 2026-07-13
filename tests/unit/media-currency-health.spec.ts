import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { menuImageCrop } from '../../src/lib/menu-image';
import { currencyHealth } from '../../src/lib/currency-health';
import { imageContentType, imagePixels, uploadImage } from '../../src/lib/server/media';

function lossyVp8Webp(width: number, height: number) {
	const webp = new Uint8Array(30);
	webp.set([82, 73, 70, 70], 0); // RIFF
	webp.set([87, 69, 66, 80], 8); // WEBP
	webp.set([86, 80, 56, 32], 12); // VP8
	webp.set([10, 0, 0, 0], 16); // chunk payload length
	webp.set([0, 0, 0, 157, 1, 42], 20); // key-frame tag and VP8 start code
	webp.set([width & 255, width >> 8, height & 255, height >> 8], 26);
	return webp;
}

describe('menu image preparation boundaries', () => {
	it('calculates centered and focused cover crops at bounded menu-card dimensions', () => {
		const centered = menuImageCrop(2400, 1200, '4:3');
		expect(centered).toMatchObject({
			width: 1200,
			height: 900,
			sourceWidth: 1600,
			sourceHeight: 1200,
			sourceX: 400,
			sourceY: 0,
		});
		expect(menuImageCrop(2400, 1200, '4:3', 1, 0).sourceX).toBe(800);
	});

	it('recognizes only permitted image magic bytes', () => {
		expect(imageContentType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
		expect(imageContentType(new Uint8Array([255, 216, 255, 0]))).toBe('image/jpeg');
		expect(imageContentType(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).toBe(
			'image/webp',
		);
		expect(imageContentType(new Uint8Array([60, 115, 118, 103]))).toBeNull();
	});

	it('reads WebP canvas dimensions before the upload size guard accepts it', () => {
		const webp = new Uint8Array(30);
		webp.set([82, 73, 70, 70], 0);
		webp.set([87, 69, 66, 80], 8);
		webp.set([86, 80, 56, 88], 12);
		webp.set([175, 4, 0], 24);
		webp.set([131, 3, 0], 27); // 1200 × 900, minus one in VP8X.
		expect(imagePixels(webp, imageContentType(webp))).toBe(1_080_000);
	});

	it('decodes a genuine lossy VP8 frame header as little-endian dimensions', () => {
		const webp = lossyVp8Webp(1200, 900);
		expect(imageContentType(webp)).toBe('image/webp');
		expect(imagePixels(webp, imageContentType(webp))).toBe(1_080_000);
	});

	it('rejects a genuine lossy VP8 image when its decoded dimensions exceed the media limit', async () => {
		const file = new File([lossyVp8Webp(8192, 8192)], 'large.webp', { type: 'image/webp' });
		await expect(uploadImage({} as D1Database, {} as R2Bucket, file, 'tenant-a')).rejects.toThrow(
			'Image dimensions are invalid or too large.',
		);
	});
});

describe('currency health', () => {
	it('reports fresh, stale and unavailable API quotes without changing order currency', () => {
		const now = 1_000_000;
		const rows = [
			{
				currency_code: 'USD',
				enabled: 1,
				is_base: 1,
				rate_mode: 'fixed' as const,
				updated_at: now,
				fixed_numerator: null,
				fixed_denominator: null,
				fetched_at: null,
				expires_at: null,
			},
			{
				currency_code: 'EUR',
				enabled: 1,
				is_base: 0,
				rate_mode: 'api' as const,
				updated_at: now,
				fixed_numerator: null,
				fixed_denominator: null,
				fetched_at: now - 10,
				expires_at: now + 10,
			},
			{
				currency_code: 'GBP',
				enabled: 1,
				is_base: 0,
				rate_mode: 'api' as const,
				updated_at: now,
				fixed_numerator: null,
				fixed_denominator: null,
				fetched_at: now - 3601,
				expires_at: now - 1,
			},
			{
				currency_code: 'JPY',
				enabled: 1,
				is_base: 0,
				rate_mode: 'api' as const,
				updated_at: now,
				fixed_numerator: null,
				fixed_denominator: null,
				fetched_at: now - 73 * 3600,
				expires_at: now - 1,
			},
		];
		const health = currencyHealth(rows, now);
		expect(health.map(({ code, status }) => [code, status])).toEqual([
			['USD', 'base'],
			['EUR', 'fresh'],
			['GBP', 'stale'],
			['JPY', 'unavailable'],
		]);
		expect(health.find((entry) => entry.code === 'JPY')?.orderingImpact).toContain(
			'orders stay in the base currency',
		);
	});

	it('does not include disabled rows, so another tenant cannot leak into the health card', () => {
		const health = currencyHealth(
			[
				{
					currency_code: 'USD',
					enabled: 1,
					is_base: 1,
					rate_mode: 'fixed' as const,
					updated_at: 1,
					fixed_numerator: null,
					fixed_denominator: null,
					fetched_at: null,
					expires_at: null,
				},
				{
					currency_code: 'LEK',
					enabled: 0,
					is_base: 0,
					rate_mode: 'fixed' as const,
					updated_at: 1,
					fixed_numerator: '1',
					fixed_denominator: '1',
					fetched_at: null,
					expires_at: null,
				},
			],
			2,
		);
		expect(health.map((entry) => entry.code)).toEqual(['USD']);
	});

	it('loads health through a restaurant-scoped rate join', async () => {
		const source = await readFile(
			resolve(process.cwd(), 'src/routes/admin/settings/+page.server.ts'),
			'utf8',
		);
		expect(source).toContain('s.restaurant_id=c.restaurant_id');
		expect(source).toContain('WHERE c.restaurant_id=?');
	});
});
