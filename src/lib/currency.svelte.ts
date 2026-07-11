import { getContext, setContext } from 'svelte';
import type { CurrencyFormat } from './money';
import { convertAndFormat, formatBaseMinor } from './money';
import type { DisplayCurrency, RateInfo } from './types';

const CURRENCY_KEY = Symbol('menyue-currency');

export interface CurrencyOption {
	code: string;
	label: string;
	fmt: CurrencyFormat;
	rate: number; // display units per 1 base unit
	provider: string;
	freshness: RateInfo['freshness'];
	isBase: boolean;
}

export class CurrencyController {
	base: CurrencyFormat;
	options: CurrencyOption[];
	selectedCode = $state('');
	private slug: string;

	constructor(base: CurrencyFormat, currencies: DisplayCurrency[], rates: RateInfo[], slug: string) {
		this.base = base;
		this.slug = slug;
		const rateByCode = new Map(rates.map((r) => [r.code, r]));

		const opts: CurrencyOption[] = [
			{
				code: base.code,
				label: `${base.code} · Base`,
				fmt: base,
				rate: 1,
				provider: 'base',
				freshness: 'fixed',
				isBase: true
			}
		];
		for (const c of currencies) {
			const r = rateByCode.get(c.code);
			opts.push({
				code: c.code,
				label: c.code,
				fmt: { code: c.code, symbol: c.symbol, precision: c.precision, symbolPosition: c.symbolPosition },
				rate: r?.rate ?? c.fallbackRate,
				provider: r?.provider ?? 'fallback',
				freshness: r?.freshness ?? 'fallback',
				isBase: false
			});
		}
		this.options = opts;

		// restore persisted selection, recovering if it is no longer available
		let initial = base.code;
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(this.storageKey());
			if (stored && opts.some((o) => o.code === stored)) initial = stored;
		}
		this.selectedCode = initial;
	}

	private storageKey() {
		return `menyue:currency:${this.slug}`;
	}

	get selected(): CurrencyOption {
		return this.options.find((o) => o.code === this.selectedCode) ?? this.options[0];
	}

	select(code: string) {
		if (!this.options.some((o) => o.code === code)) return;
		this.selectedCode = code;
		if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey(), code);
	}

	format(minorBase: number): string {
		const sel = this.selected;
		if (sel.isBase) return formatBaseMinor(minorBase, this.base);
		return convertAndFormat(minorBase, this.base.precision, sel.rate, sel.fmt);
	}

	// Whether the current display differs from the authoritative base currency.
	get isConverted(): boolean {
		return !this.selected.isBase;
	}

	get freshnessNote(): string | null {
		const sel = this.selected;
		if (sel.isBase) return null;
		switch (sel.freshness) {
			case 'fresh':
				return `Estimated · live rate via ${sel.provider}`;
			case 'stale':
				return `Estimated · last known rate via ${sel.provider}`;
			case 'fallback':
				return 'Estimated · using fallback rate';
			case 'fixed':
				return 'Estimated · fixed rate';
			default:
				return 'Estimated';
		}
	}
}

export function setCurrency(c: CurrencyController): CurrencyController {
	return setContext(CURRENCY_KEY, c);
}
export function getCurrency(): CurrencyController {
	return getContext<CurrencyController>(CURRENCY_KEY);
}
