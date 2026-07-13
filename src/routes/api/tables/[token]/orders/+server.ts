import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { sha256 } from '$lib/server/auth';
import { convertMinor, displayQuotes } from '$lib/server/currency';
import { publishOrderCreated } from '$lib/server/order-notifications';
import { addOrderLineTotal } from '$lib/server/order-totals';

const schema = z.object({
	idempotencyKey: z.string().uuid(),
	note: z.string().max(500).optional(),
	lines: z
		.array(
			z.object({
				itemId: z.string(),
				quantity: z.number().int().min(1).max(20),
				choiceIds: z.array(z.string()).default([]),
				note: z.string().trim().max(300).optional(),
				suggestedFromItemId: z.string().min(1).max(200).optional(),
			}),
		)
		.min(1)
		.max(30),
});

export const POST: RequestHandler = async ({ params, request, platform }) => {
	if (!params.token) return json({ message: 'Unavailable' }, { status: 404 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ message: 'Invalid order' }, { status: 400 });
	const db = platform!.env.DB;
	const table = await db
		.prepare(
			'SELECT t.id,t.restaurant_id,r.currency FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.token_hash=? AND t.enabled=1',
		)
		.bind(await sha256(params.token))
		.first<{ id: string; restaurant_id: string; currency: string }>();
	if (!table) return json({ message: 'Table unavailable' }, { status: 404 });
	const requestFingerprint = await sha256(
		JSON.stringify({ note: parsed.data.note ?? null, lines: parsed.data.lines }),
	);

	const findPrevious = () =>
		db
			.prepare(
				'SELECT id,display_number AS displayNumber,total_minor AS totalMinor,currency,status,request_fingerprint AS requestFingerprint FROM orders WHERE table_id=? AND idempotency_key=?',
			)
			.bind(table.id, parsed.data.idempotencyKey)
			.first<{
				id: string;
				displayNumber: number;
				totalMinor: number;
				currency: string;
				status: string;
				requestFingerprint: string;
			}>();
	const previousResponse = (previous: Awaited<ReturnType<typeof findPrevious>>) => {
		if (!previous) return null;
		if (previous.requestFingerprint && previous.requestFingerprint !== requestFingerprint)
			return json(
				{ message: 'This submission key belongs to a different order. Keep your cart and refresh before trying again.' },
				{ status: 409 },
			);
		const { requestFingerprint: _requestFingerprint, ...order } = previous;
		return json({ order, idempotent: true, nextIdempotencyKey: crypto.randomUUID() });
	};
	const previous = await findPrevious();
	const recovered = previousResponse(previous);
	if (recovered) return recovered;

	const ids = [...new Set(parsed.data.lines.map((line) => line.itemId))];
	const marks = ids.map(() => '?').join(',');
	const items = await db
		.prepare(`SELECT i.id,i.name,i.allergy_note,i.discoverability,i.availability,
		COALESCE((SELECT p.price_minor FROM item_promotions p WHERE p.item_id=i.id AND p.enabled=1 AND p.price_minor IS NOT NULL AND (p.starts_at IS NULL OR p.starts_at<=CURRENT_TIMESTAMP) AND (p.ends_at IS NULL OR p.ends_at>CURRENT_TIMESTAMP) ORDER BY p.position LIMIT 1),i.base_price_minor) unit,
		(SELECT p.label FROM item_promotions p WHERE p.item_id=i.id AND p.enabled=1 AND (p.starts_at IS NULL OR p.starts_at<=CURRENT_TIMESTAMP) AND (p.ends_at IS NULL OR p.ends_at>CURRENT_TIMESTAMP) ORDER BY p.position LIMIT 1) promotion_label,
		(SELECT GROUP_CONCAT(a.name, ', ') FROM item_allergens ia JOIN allergens a ON a.id=ia.allergen_id WHERE ia.item_id=i.id) allergens
		FROM menu_items i JOIN menu_categories c ON c.id=i.category_id
		WHERE i.id IN (${marks}) AND c.restaurant_id=? AND c.enabled=1 AND c.archived=0 AND i.enabled=1 AND i.archived=0`)
		.bind(...ids, table.restaurant_id)
		.all<{
			id: string;
			name: string;
			allergy_note: string | null;
			unit: number;
			promotion_label: string | null;
			allergens: string | null;
			discoverability: 'browse' | 'suggestion_only';
			availability: 'available' | 'sold_out';
		}>();
	if (items.results.length !== ids.length)
		return json({ message: 'A dish changed; refresh.' }, { status: 409 });
	for (const wanted of parsed.data.lines) {
		const item = items.results.find((candidate) => candidate.id === wanted.itemId)!;
		if (item.availability !== 'available')
			return json({ message: 'One or more dishes are sold out. Refresh the menu.' }, { status: 409 });
		if (item.discoverability !== 'suggestion_only') continue;
		if (!wanted.suggestedFromItemId || !ids.includes(wanted.suggestedFromItemId))
			return json({ message: 'This suggestion is no longer available. Refresh the menu.' }, { status: 409 });
		const edge = await db
			.prepare(
				`SELECT 1 FROM item_suggestions s
				 JOIN menu_items source ON source.id=s.item_id
				 JOIN menu_categories source_category ON source_category.id=source.category_id
				 WHERE s.restaurant_id=? AND s.item_id=? AND s.suggested_item_id=? AND s.enabled=1
				 AND source.enabled=1 AND source.archived=0 AND source.availability='available'
				 AND source_category.restaurant_id=? AND source_category.enabled=1 AND source_category.archived=0`,
			)
			.bind(table.restaurant_id, wanted.suggestedFromItemId, wanted.itemId, table.restaurant_id)
			.first();
		if (!edge)
			return json({ message: 'This suggestion is no longer available. Refresh the menu.' }, { status: 409 });
	}

	let total = 0;
	const lines: Array<{
		item: (typeof items.results)[number];
		quantity: number;
		note?: string;
		total: number;
		choices: Array<{ group: string; name: string; delta: number }>;
	}> = [];
	for (const wanted of parsed.data.lines) {
		const item = items.results.find((candidate) => candidate.id === wanted.itemId)!;
		const groups = await db
			.prepare(
				'SELECT id,name,min_choices,max_choices FROM combo_groups WHERE item_id=? AND enabled=1',
			)
			.bind(item.id)
			.all<{ id: string; name: string; min_choices: number; max_choices: number }>();
		const validChoiceIds = new Set<string>();
		let delta = 0;
		const choices: Array<{ group: string; name: string; delta: number }> = [];
		for (const group of groups.results) {
			const options = await db
				.prepare(
					'SELECT id,name,price_delta_minor FROM combo_choices WHERE group_id=? AND enabled=1',
				)
				.bind(group.id)
				.all<{ id: string; name: string; price_delta_minor: number }>();
			for (const option of options.results) validChoiceIds.add(option.id);
			const picked = options.results.filter((option) => wanted.choiceIds.includes(option.id));
			if (picked.length < group.min_choices || picked.length > group.max_choices)
				return json(
					{ message: `Choose ${group.min_choices}-${group.max_choices} for ${group.name}` },
					{ status: 409 },
				);
			for (const choice of picked) {
				delta += choice.price_delta_minor;
				choices.push({ group: group.name, name: choice.name, delta: choice.price_delta_minor });
			}
		}
		if (wanted.choiceIds.some((id) => !validChoiceIds.has(id)))
			return json({ message: 'A combo option changed; refresh.' }, { status: 409 });
		const unitMinor = item.unit + delta;
		const lineTotal = addOrderLineTotal(unitMinor, wanted.quantity, total);
		if (lineTotal === null)
			return json({ message: 'This order contains an invalid price. Refresh the menu and try again.' }, { status: 409 });
		total += lineTotal;
		lines.push({ item, quantity: wanted.quantity, note: wanted.note, total: lineTotal, choices });
	}

	const orderId = crypto.randomUUID();
	const money = await db.prepare('SELECT currency_minor_unit,currency_locale FROM restaurants WHERE id=?').bind(table.restaurant_id).first<{currency_minor_unit:number;currency_locale:string}>();
	const statements = [
		db.prepare('INSERT OR IGNORE INTO order_sequences(restaurant_id,next_number) VALUES(?,1)').bind(table.restaurant_id),
		db
			.prepare(
				`INSERT INTO orders(id,restaurant_id,display_number,table_id,idempotency_key,request_fingerprint,total_minor,currency,note)
				 SELECT ?,?,next_number,?,?,?,?,?,? FROM order_sequences WHERE restaurant_id=?`,
			)
			.bind(
				orderId,
				table.restaurant_id,
				table.id,
				parsed.data.idempotencyKey,
				requestFingerprint,
				total,
				table.currency,
				parsed.data.note ?? null,
				table.restaurant_id,
			),
		db.prepare('UPDATE order_sequences SET next_number=next_number+1 WHERE restaurant_id=?').bind(table.restaurant_id),
	];
	statements.push(
		db
			.prepare('INSERT INTO order_events(id,order_id,type,payload_json) VALUES(?,?,?,?)')
			.bind(crypto.randomUUID(), orderId, 'order.created', JSON.stringify({ version: 1 })),
	);
	statements.push(db.prepare('INSERT OR REPLACE INTO order_money_snapshots(order_id,currency_code,minor_unit,locale,total_minor) VALUES(?,?,?,?,?)').bind(orderId, table.currency, money?.currency_minor_unit ?? 2, money?.currency_locale ?? 'en', total));
	for (const quote of await displayQuotes(db, table.restaurant_id)) statements.push(db.prepare('INSERT OR REPLACE INTO order_money_snapshots(order_id,currency_code,minor_unit,locale,total_minor,rate_numerator,rate_denominator,rate_source) VALUES(?,?,?,?,?,?,?,?)').bind(orderId,quote.code,quote.minorUnit,quote.locale,Number(convertMinor(BigInt(total),money?.currency_minor_unit ?? 2,quote.minorUnit,quote.rate)),quote.rate.numerator.toString(),quote.rate.denominator.toString(),quote.rate.source));
	for (const line of lines) {
		const lineId = crypto.randomUUID();
		const allergySnapshot =
			[line.item.allergy_note, line.item.allergens].filter(Boolean).join(' · ') || null;
		statements.push(
			db
				.prepare(
				'INSERT INTO order_lines(id,order_id,item_id,item_name,unit_minor,quantity,total_minor,promotion_label,allergy_snapshot,note) VALUES(?,?,?,?,?,?,?,?,?,?)',
				)
				.bind(
					lineId,
					orderId,
					line.item.id,
					line.item.name,
					line.total / line.quantity,
					line.quantity,
					line.total,
					line.item.promotion_label,
					allergySnapshot,
					line.note ?? null,
				),
		);
		for (const choice of line.choices)
			statements.push(
				db
					.prepare(
						'INSERT INTO order_line_choices(id,line_id,group_name,choice_name,price_delta_minor) VALUES(?,?,?,?,?)',
					)
					.bind(crypto.randomUUID(), lineId, choice.group, choice.name, choice.delta),
			);
	}
	try {
		await db.batch(statements);
	} catch (cause) {
		const raced = await findPrevious();
		const raceRecovery = previousResponse(raced);
		if (raceRecovery) return raceRecovery;
		throw cause;
	}

	const created = await findPrevious();
	if (!created) throw new Error('Committed order could not be read back.');
	publishOrderCreated(platform!, table.restaurant_id, orderId);
	return json({
		order: {
			id: orderId,
			displayNumber: created.displayNumber,
			totalMinor: total,
			currency: table.currency,
			status: 'new',
		},
		nextIdempotencyKey: crypto.randomUUID(),
	});
};
