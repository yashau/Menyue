import type { CurrencyFormat } from './money';

export type Role = 'admin' | 'manager' | 'counter';
export type Availability = 'available' | 'unavailable';
export type ConversionMode = 'fixed' | 'api';
export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'completed' | 'cancelled';

export interface Restaurant {
	id: number;
	name: string;
	slug: string;
	base: CurrencyFormat;
	settingsRevision: number;
	multiCurrencyEnabled: boolean;
	conversionMode: ConversionMode;
	beveragePrompt: {
		enabled: boolean;
		heading: string;
		body: string;
		skipLabel: string;
	};
	theme: {
		primary: string;
		accent: string;
	};
	logoKey: string | null;
	appOrigin: string | null;
}

export interface DisplayCurrency extends CurrencyFormat {
	id: number;
	displayOrder: number;
	enabled: boolean;
	mode: ConversionMode;
	fixedRate: number | null;
	fallbackRate: number;
}

export type RateFreshness = 'fixed' | 'fresh' | 'stale' | 'fallback';

export interface RateInfo {
	code: string;
	rate: number;
	provider: string;
	freshness: RateFreshness;
	fetchedAt: number | null;
}

export interface Category {
	id: number;
	name: string;
	description: string | null;
	displayOrder: number;
	enabled: boolean;
}

export interface OptionChoice {
	id: number;
	name: string;
	priceAdjustment: number;
	isDefault: boolean;
	displayOrder: number;
}

export interface OptionGroup {
	id: number;
	name: string;
	selectionType: 'single' | 'multiple';
	required: boolean;
	minSelect: number;
	maxSelect: number;
	allowNone: boolean;
	displayOrder: number;
	choices: OptionChoice[];
}

export interface MenuItem {
	id: number;
	categoryId: number | null;
	name: string;
	description: string | null;
	basePrice: number;
	imageSeed: string;
	imageKey: string | null;
	availability: Availability;
	enabled: boolean;
	listed: boolean;
	allergens: string[];
	dietary: string[];
	tags: string[];
	label: string | null;
	labelKind: 'info' | 'promo' | 'new';
	isBeverage: boolean;
	displayOrder: number;
	optionGroups: OptionGroup[];
	suggestionIds: number[];
}

// Cart / order wire types
export interface CartOptionSelection {
	groupId: number;
	groupName: string;
	choiceId: number;
	choiceName: string;
	priceAdjustment: number;
}

export interface CartLine {
	uid: string; // client line id
	itemId: number;
	quantity: number;
	notes: string;
	options: CartOptionSelection[];
	isSuggested: boolean;
}

export interface SessionUserLike {
	id: number;
	username: string;
	displayName: string;
	role: Role;
	restaurantId: number;
}
