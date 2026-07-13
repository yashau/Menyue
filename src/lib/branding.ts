export type CustomerBrand = {
	primary: string;
	primaryForeground: '#000000' | '#ffffff';
	accent: string;
	accentForeground: '#000000' | '#ffffff';
	logoAssetId?: string;
};

export const DEFAULT_CUSTOMER_BRAND: CustomerBrand = {
	primary: '#18372F',
	primaryForeground: '#ffffff',
	accent: '#EC6A45',
	accentForeground: '#000000',
};

const hex = /^#[0-9a-fA-F]{6}$/;

/** Accept only canonical CSS colours; values are later written to CSS custom properties. */
export function normalizeBrandColor(value: unknown): string | undefined {
	if (typeof value !== 'string' || !hex.test(value.trim())) return undefined;
	return value.trim().toUpperCase();
}

function channel(value: string, start: number): number {
	const raw = Number.parseInt(value.slice(start, start + 2), 16) / 255;
	return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number {
	const normalized = normalizeBrandColor(color);
	if (!normalized) throw new Error('Expected a #RRGGBB colour.');
	return 0.2126 * channel(normalized, 1) + 0.7152 * channel(normalized, 3) + 0.0722 * channel(normalized, 5);
}

export function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (lighter + 0.05) / (darker + 0.05);
}

/** Choose a readable foreground for a tenant's solid colour rather than accepting one. */
export function accessibleForeground(background: string): '#000000' | '#ffffff' {
	return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
		? '#000000'
		: '#ffffff';
}

export function projectCustomerBrand(input: {
	primaryColor?: unknown;
	accentColor?: unknown;
	logoAssetId?: unknown;
}): CustomerBrand {
	const primary = normalizeBrandColor(input.primaryColor) ?? DEFAULT_CUSTOMER_BRAND.primary;
	const accent = normalizeBrandColor(input.accentColor) ?? DEFAULT_CUSTOMER_BRAND.accent;
	const logoAssetId = typeof input.logoAssetId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(input.logoAssetId)
		? input.logoAssetId
		: undefined;
	return {
		primary,
		primaryForeground: accessibleForeground(primary),
		accent,
		accentForeground: accessibleForeground(accent),
		...(logoAssetId ? { logoAssetId } : {}),
	};
}
