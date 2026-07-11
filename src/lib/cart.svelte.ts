import { getContext, setContext } from 'svelte';
import type { CartLine, CartOptionSelection, MenuItem } from './types';

const CART_KEY = Symbol('menyue-cart');

let uidCounter = 0;
function makeUid(): string {
	uidCounter += 1;
	return `l${Date.now().toString(36)}_${uidCounter}`;
}

export class Cart {
	token: string;
	lines = $state<CartLine[]>([]);
	// Trigger items whose suggestion step the guest has already seen — avoids
	// re-prompting for the same trigger.
	promptedTriggers = $state<Set<number>>(new Set());
	beveragePromptSeen = $state(false);
	private itemsById = new Map<number, MenuItem>();

	constructor(token: string, items: MenuItem[]) {
		this.token = token;
		this.setItems(items);
		this.hydrate();
	}

	setItems(items: MenuItem[]) {
		this.itemsById = new Map(items.map((i) => [i.id, i]));
	}

	item(id: number): MenuItem | undefined {
		return this.itemsById.get(id);
	}

	private storageKey() {
		return `menyue:cart:${this.token}`;
	}

	hydrate() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(this.storageKey());
			if (!raw) return;
			const parsed = JSON.parse(raw) as { lines: CartLine[] };
			if (Array.isArray(parsed.lines)) {
				// keep only lines whose item still exists & is orderable
				this.lines = parsed.lines.filter((l) => {
					const it = this.itemsById.get(l.itemId);
					return it && it.enabled && it.availability === 'available';
				});
			}
		} catch {
			/* ignore corrupt storage */
		}
	}

	persist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(this.storageKey(), JSON.stringify({ lines: this.lines }));
		} catch {
			/* ignore */
		}
	}

	// ---- Pricing (authoritative amounts are base-currency minor units) ----
	unitBase(line: Pick<CartLine, 'itemId' | 'options'>): number {
		const item = this.itemsById.get(line.itemId);
		if (!item) return 0;
		const adj = line.options.reduce((sum, o) => sum + o.priceAdjustment, 0);
		return item.basePrice + adj;
	}

	lineTotalBase(line: CartLine): number {
		return this.unitBase(line) * line.quantity;
	}

	subtotalBase = $derived.by(() =>
		this.lines.reduce((sum, l) => sum + this.lineTotalBase(l), 0)
	);

	count = $derived.by(() => this.lines.reduce((sum, l) => sum + l.quantity, 0));

	// ---- Mutations ----
	add(input: {
		itemId: number;
		quantity: number;
		notes: string;
		options: CartOptionSelection[];
		isSuggested?: boolean;
	}): string {
		const uid = makeUid();
		this.lines = [
			...this.lines,
			{
				uid,
				itemId: input.itemId,
				quantity: Math.max(1, input.quantity),
				notes: input.notes ?? '',
				options: input.options,
				isSuggested: input.isSuggested ?? false
			}
		];
		this.persist();
		return uid;
	}

	update(uid: string, patch: Partial<Omit<CartLine, 'uid'>>) {
		this.lines = this.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l));
		this.persist();
	}

	setQuantity(uid: string, quantity: number) {
		if (quantity <= 0) return this.remove(uid);
		this.update(uid, { quantity });
	}

	remove(uid: string) {
		this.lines = this.lines.filter((l) => l.uid !== uid);
		this.persist();
	}

	clear() {
		this.lines = [];
		this.persist();
	}

	find(uid: string): CartLine | undefined {
		return this.lines.find((l) => l.uid === uid);
	}

	hasItem(itemId: number): boolean {
		return this.lines.some((l) => l.itemId === itemId);
	}

	markPrompted(itemId: number) {
		const next = new Set(this.promptedTriggers);
		next.add(itemId);
		this.promptedTriggers = next;
	}
}

export function setCart(cart: Cart): Cart {
	return setContext(CART_KEY, cart);
}

export function getCart(): Cart {
	return getContext<Cart>(CART_KEY);
}
