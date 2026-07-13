export type Role = 'admin' | 'manager';
export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type ComboChoice = { id: string; name: string; priceDeltaMinor: number; enabled: boolean; isDefault?: boolean };
export type ComboGroup = {
	id: string;
	name: string;
	minChoices: number;
	maxChoices: number;
	enabled: boolean;
	choices: ComboChoice[];
};
export type PublicItem = {
	id: string;
	code: string;
	name: string;
	priceMinor: number;
	description?: string;
	allergyNote?: string;
	photoId?: string;
	imageUrl?: string;
	dietaryLabels?: string[];
	tags?: string[];
	availability: 'available' | 'sold_out';
	promotion?: { label: string; description?: string; priceMinor?: number };
	allergens?: { name: string; severity: string }[];
	comboGroups?: ComboGroup[];
	suggestions?: PublicItem[];
};
export type PublicCategory = {
	id: string;
	name: string;
	description?: string;
	items: PublicItem[];
};
export type PublicMenu = {
	revision: number;
	currency: string;
	currencyMinorUnit: number;
	currencyLocale: string;
	displayCurrencies?: {
		code: string;
		numerator: string;
		denominator: string;
		source: 'fixed' | 'exchange-rate-api';
		minorUnit: number;
		locale: string;
		freshness: 'fresh' | 'stale' | 'fixed';
	}[];
	beveragePrompt?: { heading: string; body: string; skipLabel: string; itemIds: string[] };
	brand: {
		primary: string;
		primaryForeground: '#000000' | '#ffffff';
		accent: string;
		accentForeground: '#000000' | '#ffffff';
		logoAssetId?: string;
	};
	hero: {
		title: string;
		description?: string;
		ctaLabel?: string;
		ctaUrl?: string;
		photoId?: string;
	};
	categories: PublicCategory[];
};
