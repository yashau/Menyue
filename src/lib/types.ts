export type Role = 'admin' | 'manager';
export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type ComboChoice = { id: string; name: string; priceDeltaMinor: number; enabled: boolean };
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
	promotion?: { label: string; description?: string; priceMinor?: number };
	allergens?: { name: string; severity: string }[];
	comboGroups?: ComboGroup[];
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
	hero: {
		title: string;
		description?: string;
		ctaLabel?: string;
		ctaUrl?: string;
		photoId?: string;
	};
	categories: PublicCategory[];
};
