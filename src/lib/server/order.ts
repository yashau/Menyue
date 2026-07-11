import type { D1Database } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';
import type { Restaurant } from '$lib/types';
import { getMenuItems } from './menu';
import { getDisplayCurrencies, resolveRates } from './currency';
import { randomToken } from './auth';
import type { TableRef } from './guest';

export interface OrderOptionInput {
	groupId: number;
	choiceId: number;
}
export interface OrderLineInput {
	itemId: number;
	quantity: number;
	notes?: string;
	options?: OrderOptionInput[];
	isSuggested?: boolean;
}

export interface OrderSummary {
	id: number;
	number: string;
	tableLabel: string;
	status: string;
	subtotalBase: number;
	totalBase: number;
	notes: string | null;
	currencySnapshot: unknown;
	createdAt: number;
}

export async function issueIdempotencyKey(
	db: D1Database,
	restaurantId: number,
	tableId: number
): Promise<string> {
	const key = `idem_${randomToken(18)}`;
	await db
		.prepare(
			'INSERT INTO idempotency_keys (key, restaurant_id, table_id, issued_at) VALUES (?, ?, ?, unixepoch())'
		)
		.bind(key, restaurantId, tableId)
		.run();
	return key;
}

async function loadOrderSummary(db: D1Database, orderId: number, tableLabel: string): Promise<OrderSummary> {
	const row = await db
		.prepare(
			'SELECT id, order_number, status, subtotal_base, total_base, notes, currency_snapshot, created_at FROM orders WHERE id = ?'
		)
		.bind(orderId)
		.first<{
			id: number;
			order_number: string;
			status: string;
			subtotal_base: number;
			total_base: number;
			notes: string | null;
			currency_snapshot: string;
			created_at: number;
		}>();
	if (!row) throw error(500, 'Order not found after creation');
	let snapshot: unknown = {};
	try {
		snapshot = JSON.parse(row.currency_snapshot);
	} catch {
		snapshot = {};
	}
	return {
		id: row.id,
		number: row.order_number,
		tableLabel,
		status: row.status,
		subtotalBase: row.subtotal_base,
		totalBase: row.total_base,
		notes: row.notes,
		currencySnapshot: snapshot,
		createdAt: row.created_at
	};
}

export interface SubmitResult {
	status: 'created' | 'duplicate';
	order: OrderSummary;
	nextKey: string;
}

export async function submitOrder(
	db: D1Database,
	restaurant: Restaurant,
	table: TableRef,
	input: {
		idempotencyKey: string;
		lines: OrderLineInput[];
		notes?: string;
		displayCurrencyCode?: string;
	}
): Promise<SubmitResult> {
	const restaurantId = restaurant.id;

	// 1. The key MUST have been issued by the server for this table.
	const keyRow = await db
		.prepare('SELECT key, order_id FROM idempotency_keys WHERE key = ? AND restaurant_id = ? AND table_id = ?')
		.bind(input.idempotencyKey, restaurantId, table.id)
		.first<{ key: string; order_id: number | null }>();
	if (!keyRow) throw error(400, 'This order session has expired. Please refresh and try again.');

	// 2. Retry safety: a key that already produced an order returns that order.
	if (keyRow.order_id) {
		const order = await loadOrderSummary(db, keyRow.order_id, table.label);
		return { status: 'duplicate', order, nextKey: await issueIdempotencyKey(db, restaurantId, table.id) };
	}

	if (!Array.isArray(input.lines) || input.lines.length === 0) {
		throw error(400, 'Your cart is empty.');
	}

	// 3. Server-authoritative validation & repricing against the live menu.
	const items = await getMenuItems(db, restaurantId); // enabled only
	const itemsById = new Map(items.map((i) => [i.id, i]));

	interface BuiltLine {
		itemId: number;
		name: string;
		unitBase: number;
		quantity: number;
		lineTotal: number;
		options: { groupName: string; choiceName: string; priceAdjustment: number }[];
		notes: string;
		isSuggested: boolean;
	}
	const built: BuiltLine[] = [];
	let subtotal = 0;

	for (const line of input.lines) {
		const item = itemsById.get(line.itemId);
		if (!item) throw error(400, 'An item in your cart is no longer on the menu.');
		if (!item.enabled || item.availability !== 'available') {
			throw error(400, `"${item.name}" is currently unavailable.`);
		}
		const quantity = Number(line.quantity);
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
			throw error(400, 'Invalid quantity.');
		}

		// index groups/choices for this item
		const groupById = new Map(item.optionGroups.map((g) => [g.id, g]));
		const selections = line.options ?? [];
		const byGroup = new Map<number, number[]>();
		for (const sel of selections) {
			const group = groupById.get(sel.groupId);
			if (!group) throw error(400, `Invalid option for "${item.name}".`);
			const choice = group.choices.find((c) => c.id === sel.choiceId);
			if (!choice) throw error(400, `Invalid option choice for "${item.name}".`);
			const arr = byGroup.get(sel.groupId) ?? [];
			arr.push(sel.choiceId);
			byGroup.set(sel.groupId, arr);
		}

		let unit = item.basePrice;
		const optionSnapshot: BuiltLine['options'] = [];
		for (const group of item.optionGroups) {
			const chosen = byGroup.get(group.id) ?? [];
			const effectiveMin = group.required && !group.allowNone ? Math.max(1, group.minSelect) : group.minSelect;
			if (chosen.length < effectiveMin) {
				throw error(400, `Please choose ${effectiveMin} option(s) for "${group.name}".`);
			}
			if (group.maxSelect > 0 && chosen.length > group.maxSelect) {
				throw error(400, `Too many options selected for "${group.name}".`);
			}
			if (group.selectionType === 'single' && chosen.length > 1) {
				throw error(400, `Only one choice allowed for "${group.name}".`);
			}
			// dedupe & price
			const seen = new Set<number>();
			for (const choiceId of chosen) {
				if (seen.has(choiceId)) continue;
				seen.add(choiceId);
				const choice = group.choices.find((c) => c.id === choiceId)!;
				unit += choice.priceAdjustment;
				optionSnapshot.push({
					groupName: group.name,
					choiceName: choice.name,
					priceAdjustment: choice.priceAdjustment
				});
			}
		}

		const lineTotal = unit * quantity;
		subtotal += lineTotal;
		built.push({
			itemId: item.id,
			name: item.name,
			unitBase: unit,
			quantity,
			lineTotal,
			options: optionSnapshot,
			notes: (line.notes ?? '').slice(0, 300),
			isSuggested: !!line.isSuggested
		});
	}

	const total = subtotal;

	// 4. Immutable currency-formatting snapshot.
	const currencies = await getDisplayCurrencies(db, restaurantId);
	const rateMap = await resolveRates(db, restaurant, currencies);
	const displayRate = input.displayCurrencyCode ? rateMap.get(input.displayCurrencyCode) : undefined;
	const snapshot = {
		base: restaurant.base,
		display: displayRate
			? {
					code: displayRate.code,
					rate: displayRate.rate,
					provider: displayRate.provider,
					freshness: displayRate.freshness
				}
			: null,
		capturedAt: Math.floor(Date.now() / 1000)
	};

	// 5. Reserve an order number atomically.
	const seqRow = await db
		.prepare('UPDATE restaurants SET next_order_seq = next_order_seq + 1, updated_at = unixepoch() WHERE id = ? RETURNING next_order_seq')
		.bind(restaurantId)
		.first<{ next_order_seq: number }>();
	const assigned = (seqRow?.next_order_seq ?? 1) - 1;
	const prefix = restaurant.slug.slice(0, 2).toUpperCase() || 'MN';
	const orderNumber = `${prefix}-${String(assigned).padStart(4, '0')}`;
	const nowSec = Math.floor(Date.now() / 1000);

	// 6. Insert order; if the key raced to another order, fall back to duplicate.
	let orderId: number;
	try {
		const inserted = await db
			.prepare(
				`INSERT INTO orders (restaurant_id, table_id, order_number, status, subtotal_base, total_base, currency_snapshot, notes, idempotency_key, created_at, updated_at)
				 VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?) RETURNING id`
			)
			.bind(
				restaurantId,
				table.id,
				orderNumber,
				subtotal,
				total,
				JSON.stringify(snapshot),
				(input.notes ?? '').slice(0, 500) || null,
				input.idempotencyKey,
				nowSec,
				nowSec
			)
			.first<{ id: number }>();
		orderId = inserted!.id;
	} catch (err) {
		// UNIQUE(restaurant_id, idempotency_key) violated -> another request won.
		const existing = await db
			.prepare('SELECT id FROM orders WHERE restaurant_id = ? AND idempotency_key = ?')
			.bind(restaurantId, input.idempotencyKey)
			.first<{ id: number }>();
		if (existing) {
			const order = await loadOrderSummary(db, existing.id, table.label);
			return { status: 'duplicate', order, nextKey: await issueIdempotencyKey(db, restaurantId, table.id) };
		}
		throw error(500, 'Could not place order. Please try again.');
	}

	const itemStmts = built.map((b) =>
		db
			.prepare(
				`INSERT INTO order_items (order_id, restaurant_id, item_id, name_snapshot, unit_base_price, quantity, line_total_base, options_snapshot, notes, is_suggested)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				orderId,
				restaurantId,
				b.itemId,
				b.name,
				b.unitBase,
				b.quantity,
				b.lineTotal,
				JSON.stringify(b.options),
				b.notes || null,
				b.isSuggested ? 1 : 0
			)
	);
	itemStmts.push(
		db
			.prepare('UPDATE idempotency_keys SET order_id = ?, consumed_at = unixepoch() WHERE key = ?')
			.bind(orderId, input.idempotencyKey)
	);
	await db.batch(itemStmts);

	const order = await loadOrderSummary(db, orderId, table.label);
	return { status: 'created', order, nextKey: await issueIdempotencyKey(db, restaurantId, table.id) };
}
