import { describe, expect, it } from 'vitest';
import {
	accessibleForeground,
	contrastRatio,
	normalizeBrandColor,
	projectCustomerBrand,
} from '../../src/lib/branding';

describe('customer branding', () => {
	it('allows only canonical hex colours before values reach CSS custom properties', () => {
		expect(normalizeBrandColor('#ab12CD')).toBe('#AB12CD');
		expect(normalizeBrandColor('red; background:url(javascript:alert(1))')).toBeUndefined();
		expect(normalizeBrandColor('#1234')).toBeUndefined();
	});

	it('chooses a readable foreground for every tenant colour', () => {
		for (const color of ['#000000', '#FFFFFF', '#18372F', '#EC6A45', '#777777']) {
			const foreground = accessibleForeground(color);
			expect(contrastRatio(color, foreground)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('falls back safely when a stored branding value is malformed', () => {
		const brand = projectCustomerBrand({
			primaryColor: 'var(--unsafe)',
			accentColor: '#40A070',
			logoAssetId: 'tenant-logo_1',
		});
		expect(brand).toMatchObject({
			primary: '#18372F',
			accent: '#40A070',
			logoAssetId: 'tenant-logo_1',
		});
		expect(contrastRatio(brand.primary, brand.primaryForeground)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(brand.accent, brand.accentForeground)).toBeGreaterThanOrEqual(4.5);
	});
});
