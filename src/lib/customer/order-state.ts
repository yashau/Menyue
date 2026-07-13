/**
 * Customer-order state is deliberately framework-free. The table page can keep it in
 * Svelte state, while tests and future clients use the same cart and wizard rules.
 */

export const ORDER_LINE_CAP = 30;

export type LineRole = 'parent' | 'suggestion' | 'beverage';

export type OrderVariant = {
	lineId: string;
	bundleId: string;
	role: LineRole;
	itemId: string;
	quantity: number;
	choiceIds: string[];
	note?: string;
	/** Server-validated origin for a suggestion-only item. */
	suggestedFromItemId?: string;
	/** The current displayed unit estimate. It is never included in the API payload. */
	unitMinor?: number;
};

export type OrderBundle = {
	bundleId: string;
	lines: OrderVariant[];
};

export type OrderCart = {
	maxLines: number;
	bundles: OrderBundle[];
};

export type VariantInput = {
	itemId: string;
	quantity?: number;
	choiceIds?: readonly string[];
	note?: string | null;
	suggestedFromItemId?: string;
	unitMinor?: number;
};

export type NewBundle = {
	parent: VariantInput;
	additions?: Array<VariantInput & { role?: Exclude<LineRole, 'parent'> }>;
};

export type ApiOrderLine = {
	itemId: string;
	quantity: number;
	choiceIds: string[];
	note?: string;
	suggestedFromItemId?: string;
};

export type CartMutation = {
	cart: OrderCart;
	accepted: boolean;
	reason?: 'missing-line' | 'quantity-one' | 'line-cap';
	lineId?: string;
	bundleId?: string;
};

export type IdFactory = () => string;

let idSequence = 0;
const defaultIdFactory: IdFactory = () => {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
		return crypto.randomUUID();
	idSequence += 1;
	return `local-order-${idSequence}`;
};

export function normalizeChoiceIds(choiceIds: readonly string[] = []): string[] {
	return [...new Set(choiceIds.map((id) => id.trim()).filter(Boolean))].sort((left, right) =>
		left.localeCompare(right),
	);
}

/** Notes retain casing, but equivalent whitespace does not make a new plate variant. */
export function normalizeNote(note: string | null | undefined): string | undefined {
	const normalized = note?.trim().replace(/\s+/g, ' ');
	return normalized || undefined;
}

export function variantKey(
	variant: Pick<
		OrderVariant | VariantInput,
		'itemId' | 'choiceIds' | 'note' | 'suggestedFromItemId'
	>,
): string {
	return JSON.stringify([
		variant.itemId,
		normalizeChoiceIds(variant.choiceIds),
		normalizeNote(variant.note),
		variant.suggestedFromItemId?.trim() || undefined,
	]);
}

function quantityOf(input: VariantInput): number {
	return Math.max(1, Math.floor(input.quantity ?? 1));
}

function makeVariant(
	bundleId: string,
	role: LineRole,
	input: VariantInput,
	idFactory: IdFactory,
): OrderVariant {
	return {
		lineId: idFactory(),
		bundleId,
		role,
		itemId: input.itemId,
		quantity: quantityOf(input),
		choiceIds: normalizeChoiceIds(input.choiceIds),
		...(normalizeNote(input.note) ? { note: normalizeNote(input.note) } : {}),
		...(input.suggestedFromItemId?.trim()
			? { suggestedFromItemId: input.suggestedFromItemId.trim() }
			: {}),
		...(input.unitMinor === undefined ? {} : { unitMinor: input.unitMinor }),
	};
}

function cloneCart(cart: OrderCart): OrderCart {
	return {
		maxLines: cart.maxLines,
		bundles: cart.bundles.map((bundle) => ({
			...bundle,
			lines: bundle.lines.map((line) => ({ ...line, choiceIds: [...line.choiceIds] })),
		})),
	};
}

function mergeBundleLines(lines: OrderVariant[]): OrderVariant[] {
	const merged: OrderVariant[] = [];
	for (const line of lines) {
		const existing = merged.find((candidate) => variantKey(candidate) === variantKey(line));
		if (existing) existing.quantity += line.quantity;
		else merged.push(line);
	}
	return merged;
}

export function createOrderCart(options: { maxLines?: number } = {}): OrderCart {
	return { maxLines: options.maxLines ?? ORDER_LINE_CAP, bundles: [] };
}

export function flattenVariants(cart: OrderCart): OrderVariant[] {
	return cart.bundles.flatMap((bundle) => bundle.lines);
}

/** The API accepts duplicate item IDs, so each variant remains an independent payload line. */
export function flattenOrder(cart: OrderCart): ApiOrderLine[] {
	return flattenVariants(cart).map(
		({ itemId, quantity, choiceIds, note, suggestedFromItemId }) => ({
			itemId,
			quantity,
			choiceIds: [...choiceIds],
			...(note ? { note } : {}),
			...(suggestedFromItemId ? { suggestedFromItemId } : {}),
		}),
	);
}

export function lineCount(cart: OrderCart): number {
	return flattenVariants(cart).length;
}

export function lineCapMessage(cart: Pick<OrderCart, 'maxLines'>): string {
	return `An order can contain up to ${cart.maxLines} separate item lines.`;
}

export function hasLineCapacity(cart: OrderCart, additionalLines = 1): boolean {
	return lineCount(cart) + additionalLines <= cart.maxLines;
}

export function addBundle(
	cart: OrderCart,
	input: NewBundle,
	idFactory: IdFactory = defaultIdFactory,
): CartMutation {
	const bundleId = idFactory();
	const lines = mergeBundleLines([
		makeVariant(bundleId, 'parent', input.parent, idFactory),
		...(input.additions ?? []).map(({ role = 'suggestion', ...variant }) =>
			makeVariant(bundleId, role, variant, idFactory),
		),
	]);
	if (!hasLineCapacity(cart, lines.length)) return { cart, accepted: false, reason: 'line-cap' };
	return {
		cart: { ...cart, bundles: [...cart.bundles, { bundleId, lines }] },
		accepted: true,
		bundleId,
		lineId: lines[0]?.lineId,
	};
}

export function addVariantToBundle(
	cart: OrderCart,
	bundleId: string,
	input: VariantInput,
	role: Exclude<LineRole, 'parent'> = 'suggestion',
	idFactory: IdFactory = defaultIdFactory,
): CartMutation {
	const bundle = cart.bundles.find((candidate) => candidate.bundleId === bundleId);
	if (!bundle) return { cart, accepted: false, reason: 'missing-line' };
	const candidate = makeVariant(bundleId, role, input, idFactory);
	const existing = bundle.lines.find((line) => variantKey(line) === variantKey(candidate));
	if (!existing && !hasLineCapacity(cart)) return { cart, accepted: false, reason: 'line-cap' };
	const next = cloneCart(cart);
	const nextBundle = next.bundles.find((entry) => entry.bundleId === bundleId)!;
	const matching = nextBundle.lines.find((line) => variantKey(line) === variantKey(candidate));
	if (matching) {
		matching.quantity += candidate.quantity;
		return { cart: next, accepted: true, lineId: matching.lineId, bundleId };
	}
	nextBundle.lines.push(candidate);
	return { cart: next, accepted: true, lineId: candidate.lineId, bundleId };
}

/**
 * Replaces a parent bundle as one cart mutation. Existing variants with the same
 * role and identity keep their line IDs and quantities, while removed children
 * disappear and new children receive IDs. This makes a parent edit persist every
 * child add/remove/configuration/note change without tearing the cart apart.
 */
export function replaceBundle(
	cart: OrderCart,
	bundleId: string,
	replacement: NewBundle,
	idFactory: IdFactory = defaultIdFactory,
): CartMutation {
	const current = cart.bundles.find((bundle) => bundle.bundleId === bundleId);
	if (!current) return { cart, accepted: false, reason: 'missing-line' };
	const requested = [
		{ role: 'parent' as const, ...replacement.parent },
		...(replacement.additions ?? []).map(({ role = 'suggestion' as const, ...line }) => ({
			role,
			...line,
		})),
	];
	const retained = new Set<string>();
	const lines = requested.map((input) => {
		const match = current.lines.find(
			(line) =>
				!retained.has(line.lineId) &&
				line.role === input.role &&
				variantKey(line) === variantKey(input),
		);
		if (match) {
			retained.add(match.lineId);
			return {
				...match,
				quantity: quantityOf(input),
				choiceIds: normalizeChoiceIds(input.choiceIds),
				...(normalizeNote(input.note) ? { note: normalizeNote(input.note) } : { note: undefined }),
				...(input.suggestedFromItemId?.trim()
					? { suggestedFromItemId: input.suggestedFromItemId.trim() }
					: { suggestedFromItemId: undefined }),
				...(input.unitMinor === undefined ? {} : { unitMinor: input.unitMinor }),
			};
		}
		return makeVariant(bundleId, input.role, input, idFactory);
	});
	const next = cloneCart(cart);
	next.bundles = next.bundles.map((bundle) =>
		bundle.bundleId === bundleId ? { ...bundle, lines: mergeBundleLines(lines) } : bundle,
	);
	return { cart: next, accepted: true, bundleId };
}

/**
 * Separates one physical unit from a multi-quantity variant. The new plate can then
 * carry its own options or kitchen note without changing its siblings.
 */
export function splitVariant(
	cart: OrderCart,
	lineId: string,
	customization: Partial<Pick<VariantInput, 'choiceIds' | 'note' | 'unitMinor'>>,
	idFactory: IdFactory = defaultIdFactory,
): CartMutation {
	const original = flattenVariants(cart).find((line) => line.lineId === lineId);
	if (!original) return { cart, accepted: false, reason: 'missing-line' };
	if (original.quantity <= 1) return { cart, accepted: false, reason: 'quantity-one' };
	const input: VariantInput = {
		itemId: original.itemId,
		choiceIds: customization.choiceIds ?? original.choiceIds,
		note: customization.note ?? original.note,
		// A split is still the same suggestion-only item; only its plate-specific
		// configuration changes.
		suggestedFromItemId: original.suggestedFromItemId,
		unitMinor: customization.unitMinor ?? original.unitMinor,
	};
	const candidate = makeVariant(original.bundleId, original.role, input, idFactory);
	const canMerge = flattenVariants(cart).some(
		(line) =>
			line.lineId !== lineId &&
			line.bundleId === original.bundleId &&
			variantKey(line) === variantKey(candidate),
	);
	if (!canMerge && !hasLineCapacity(cart)) return { cart, accepted: false, reason: 'line-cap' };
	const next = cloneCart(cart);
	const nextBundle = next.bundles.find((bundle) => bundle.bundleId === original.bundleId)!;
	const source = nextBundle.lines.find((line) => line.lineId === lineId)!;
	source.quantity -= 1;
	const matching = nextBundle.lines.find(
		(line) => line.lineId !== lineId && variantKey(line) === variantKey(candidate),
	);
	if (matching) {
		matching.quantity += 1;
		return { cart: next, accepted: true, lineId: matching.lineId, bundleId: original.bundleId };
	}
	nextBundle.lines.push(candidate);
	return { cart: next, accepted: true, lineId: candidate.lineId, bundleId: original.bundleId };
}

/** Applies a new variant to a line, merging it into an identical sibling when possible. */
export function configureVariant(
	cart: OrderCart,
	lineId: string,
	customization: Partial<Pick<VariantInput, 'choiceIds' | 'note' | 'unitMinor'>>,
): CartMutation {
	const current = flattenVariants(cart).find((line) => line.lineId === lineId);
	if (!current) return { cart, accepted: false, reason: 'missing-line' };
	const next = cloneCart(cart);
	const bundle = next.bundles.find((candidate) => candidate.bundleId === current.bundleId)!;
	const changed = bundle.lines.find((line) => line.lineId === lineId)!;
	changed.choiceIds = normalizeChoiceIds(customization.choiceIds ?? changed.choiceIds);
	changed.note = normalizeNote(customization.note ?? changed.note);
	if (customization.unitMinor !== undefined) changed.unitMinor = customization.unitMinor;
	const matching = bundle.lines.find(
		(line) => line.lineId !== changed.lineId && variantKey(line) === variantKey(changed),
	);
	if (matching) {
		matching.quantity += changed.quantity;
		bundle.lines = bundle.lines.filter((line) => line.lineId !== changed.lineId);
		return { cart: next, accepted: true, lineId: matching.lineId, bundleId: bundle.bundleId };
	}
	return { cart: next, accepted: true, lineId, bundleId: bundle.bundleId };
}

/** Changes an aggregated variant's quantity without changing its configuration. */
export function setVariantQuantity(
	cart: OrderCart,
	lineId: string,
	quantity: number,
): CartMutation {
	const current = flattenVariants(cart).find((line) => line.lineId === lineId);
	if (!current) return { cart, accepted: false, reason: 'missing-line' };
	const next = cloneCart(cart);
	const line = flattenVariants(next).find((candidate) => candidate.lineId === lineId)!;
	line.quantity = Math.max(1, Math.floor(quantity));
	return { cart: next, accepted: true, lineId, bundleId: current.bundleId };
}

/** Removes only the selected variant; empty bundles disappear with their final line. */
export function removeVariant(cart: OrderCart, lineId: string): OrderCart {
	const next = cloneCart(cart);
	return {
		...next,
		bundles: next.bundles
			.map((bundle) => ({
				...bundle,
				lines: bundle.lines.filter((line) => line.lineId !== lineId),
			}))
			.filter((bundle) => bundle.lines.length > 0),
	};
}

export function removeBundle(cart: OrderCart, bundleId: string): OrderCart {
	return { ...cart, bundles: cart.bundles.filter((bundle) => bundle.bundleId !== bundleId) };
}

export function cartTotalMinor(
	cart: OrderCart,
	unitPrice: (line: OrderVariant) => number = (line) => line.unitMinor ?? 0,
): number {
	return flattenVariants(cart).reduce((total, line) => total + unitPrice(line) * line.quantity, 0);
}

/** Checks every variant, including add-ons nested inside bundles. */
export function hasBeverage(cart: OrderCart, beverageItemIds: Iterable<string>): boolean {
	const beverages = new Set(beverageItemIds);
	return flattenOrder(cart).some((line) => beverages.has(line.itemId));
}

export type ConfigTarget = 'parent' | 'suggestion' | 'beverage';
export type FlowState =
	| { kind: 'browsing' }
	| {
			kind: 'configuring';
			target: ConfigTarget;
			returnTo: 'suggesting' | 'reviewing' | 'browsing';
			parentHasModifiers: boolean;
			hasSuggestions: boolean;
	  }
	| { kind: 'suggesting'; parentHasModifiers: boolean }
	| { kind: 'reviewing'; parentHasModifiers: boolean; hasSuggestions: boolean }
	| { kind: 'beverage-prompt'; parentHasModifiers: boolean; hasSuggestions: boolean }
	| { kind: 'submitting'; parentHasModifiers: boolean; hasSuggestions: boolean }
	| { kind: 'retrying'; parentHasModifiers: boolean; hasSuggestions: boolean }
	| { kind: 'confirmed' }
	| { kind: 'cancelled' };

export type FlowEvent =
	| { type: 'ADD'; hasModifiers: boolean; hasSuggestions: boolean }
	| {
			type: 'CONFIGURE';
			target: ConfigTarget;
			hasModifiers: boolean;
			returnTo?: 'suggesting' | 'reviewing' | 'browsing';
	  }
	| { type: 'SUGGEST'; hasSuggestions: boolean; parentHasModifiers: boolean }
	| { type: 'BACK' }
	| { type: 'CANCEL' }
	| { type: 'ESCAPE' }
	| { type: 'REVIEW'; parentHasModifiers: boolean; hasSuggestions: boolean }
	| { type: 'COMMIT' }
	| { type: 'SUBMIT'; needsBeverage: boolean }
	| { type: 'ADD_BEVERAGE'; hasModifiers: boolean }
	| { type: 'SKIP' }
	| { type: 'SUBMISSION_FAILED' }
	| { type: 'RETRY' }
	| { type: 'CONFIRM' };

export type FlowEffect =
	| 'none'
	| 'open-wizard'
	| 'show-configure'
	| 'show-suggestions'
	| 'show-review'
	| 'commit-bundle'
	| 'prompt-beverage'
	| 'submit-order'
	| 'show-retry'
	| 'reset';

export type FlowTransition = { state: FlowState; effect: FlowEffect; accepted: boolean };

const invalid = (state: FlowState): FlowTransition => ({ state, effect: 'none', accepted: false });
const reviewing = (parentHasModifiers: boolean, hasSuggestions: boolean): FlowState => ({
	kind: 'reviewing',
	parentHasModifiers,
	hasSuggestions,
});

/**
 * Finite wizard transition contract. Stage presence is always supplied by the menu;
 * this reducer never invents an empty modifiers or suggestions step.
 */
export function transitionOrderFlow(state: FlowState, event: FlowEvent): FlowTransition {
	if (event.type === 'CANCEL' || event.type === 'ESCAPE') {
		if (state.kind === 'browsing' || state.kind === 'confirmed' || state.kind === 'cancelled')
			return invalid(state);
		return { state: { kind: 'cancelled' }, effect: 'reset', accepted: true };
	}
	if (state.kind === 'cancelled')
		return event.type === 'CONFIRM'
			? { state: { kind: 'browsing' }, effect: 'reset', accepted: true }
			: invalid(state);
	if (state.kind === 'confirmed')
		return event.type === 'CONFIRM'
			? { state: { kind: 'browsing' }, effect: 'reset', accepted: true }
			: invalid(state);
	if (state.kind === 'browsing') {
		if (event.type !== 'ADD') return invalid(state);
		if (event.hasModifiers)
			return {
				state: {
					kind: 'configuring',
					target: 'parent',
					returnTo: 'browsing',
					parentHasModifiers: true,
					hasSuggestions: event.hasSuggestions,
				},
				effect: 'open-wizard',
				accepted: true,
			};
		if (event.hasSuggestions)
			return {
				state: { kind: 'suggesting', parentHasModifiers: false },
				effect: 'show-suggestions',
				accepted: true,
			};
		return { state: reviewing(false, false), effect: 'show-review', accepted: true };
	}
	if (state.kind === 'configuring') {
		if (event.type === 'SUGGEST') {
			if (event.hasSuggestions)
				return {
					state: { kind: 'suggesting', parentHasModifiers: state.parentHasModifiers },
					effect: 'show-suggestions',
					accepted: true,
				};
			return {
				state: reviewing(state.parentHasModifiers, false),
				effect: 'show-review',
				accepted: true,
			};
		}
		if (event.type === 'REVIEW')
			return {
				state: reviewing(state.parentHasModifiers, state.hasSuggestions),
				effect: 'show-review',
				accepted: true,
			};
		if (event.type === 'BACK') {
			if (state.returnTo === 'suggesting')
				return {
					state: { kind: 'suggesting', parentHasModifiers: true },
					effect: 'show-suggestions',
					accepted: true,
				};
			if (state.returnTo === 'reviewing')
				return {
					state: reviewing(state.parentHasModifiers, state.hasSuggestions),
					effect: 'show-review',
					accepted: true,
				};
			return { state: { kind: 'browsing' }, effect: 'reset', accepted: true };
		}
		return invalid(state);
	}
	if (state.kind === 'suggesting') {
		if (event.type === 'CONFIGURE') {
			if (!event.hasModifiers)
				return {
					state: reviewing(state.parentHasModifiers, true),
					effect: 'show-review',
					accepted: true,
				};
			return {
				state: {
					kind: 'configuring',
					target: event.target,
					returnTo: event.returnTo ?? 'suggesting',
					parentHasModifiers: state.parentHasModifiers,
					hasSuggestions: true,
				},
				effect: 'show-configure',
				accepted: true,
			};
		}
		if (event.type === 'REVIEW')
			return {
				state: reviewing(event.parentHasModifiers, event.hasSuggestions),
				effect: 'show-review',
				accepted: true,
			};
		if (event.type === 'BACK') {
			return state.parentHasModifiers
				? {
						state: {
							kind: 'configuring',
							target: 'parent',
							returnTo: 'browsing',
							parentHasModifiers: true,
							hasSuggestions: true,
						},
						effect: 'show-configure',
						accepted: true,
					}
				: { state: { kind: 'browsing' }, effect: 'reset', accepted: true };
		}
		return invalid(state);
	}
	if (state.kind === 'reviewing') {
		if (event.type === 'COMMIT')
			return { state: { kind: 'browsing' }, effect: 'commit-bundle', accepted: true };
		if (event.type === 'SUBMIT')
			return event.needsBeverage
				? {
						state: {
							kind: 'beverage-prompt',
							parentHasModifiers: state.parentHasModifiers,
							hasSuggestions: state.hasSuggestions,
						},
						effect: 'prompt-beverage',
						accepted: true,
					}
				: {
						state: {
							kind: 'submitting',
							parentHasModifiers: state.parentHasModifiers,
							hasSuggestions: state.hasSuggestions,
						},
						effect: 'submit-order',
						accepted: true,
					};
		if (event.type === 'BACK') {
			if (state.hasSuggestions)
				return {
					state: { kind: 'suggesting', parentHasModifiers: state.parentHasModifiers },
					effect: 'show-suggestions',
					accepted: true,
				};
			if (state.parentHasModifiers)
				return {
					state: {
						kind: 'configuring',
						target: 'parent',
						returnTo: 'browsing',
						parentHasModifiers: true,
						hasSuggestions: false,
					},
					effect: 'show-configure',
					accepted: true,
				};
			return { state: { kind: 'browsing' }, effect: 'reset', accepted: true };
		}
		return invalid(state);
	}
	if (state.kind === 'beverage-prompt') {
		if (event.type === 'ADD_BEVERAGE')
			return event.hasModifiers
				? {
						state: {
							kind: 'configuring',
							target: 'beverage',
							returnTo: 'reviewing',
							parentHasModifiers: state.parentHasModifiers,
							hasSuggestions: state.hasSuggestions,
						},
						effect: 'show-configure',
						accepted: true,
					}
				: {
						state: reviewing(state.parentHasModifiers, state.hasSuggestions),
						effect: 'show-review',
						accepted: true,
					};
		if (event.type === 'SKIP')
			return {
				state: {
					kind: 'submitting',
					parentHasModifiers: state.parentHasModifiers,
					hasSuggestions: state.hasSuggestions,
				},
				effect: 'submit-order',
				accepted: true,
			};
		if (event.type === 'BACK')
			return {
				state: reviewing(state.parentHasModifiers, state.hasSuggestions),
				effect: 'show-review',
				accepted: true,
			};
		return invalid(state);
	}
	if (state.kind === 'submitting') {
		if (event.type === 'SUBMISSION_FAILED')
			return {
				state: {
					kind: 'retrying',
					parentHasModifiers: state.parentHasModifiers,
					hasSuggestions: state.hasSuggestions,
				},
				effect: 'show-retry',
				accepted: true,
			};
		if (event.type === 'CONFIRM')
			return { state: { kind: 'confirmed' }, effect: 'none', accepted: true };
		return invalid(state);
	}
	if (state.kind === 'retrying') {
		if (event.type === 'RETRY')
			return {
				state: {
					kind: 'submitting',
					parentHasModifiers: state.parentHasModifiers,
					hasSuggestions: state.hasSuggestions,
				},
				effect: 'submit-order',
				accepted: true,
			};
		if (event.type === 'BACK')
			return {
				state: reviewing(state.parentHasModifiers, state.hasSuggestions),
				effect: 'show-review',
				accepted: true,
			};
		return invalid(state);
	}
	return invalid(state);
}
