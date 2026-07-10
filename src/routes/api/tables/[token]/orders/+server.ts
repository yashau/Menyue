import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { sha256 } from '$lib/server/auth';

const schema = z.object({
	idempotencyKey: z.string().uuid(),
	note: z.string().max(500).optional(),
	lines: z
		.array(
			z.object({
				itemId: z.string(),
				quantity: z.number().int().min(1).max(20),
				choiceIds: z.array(z.string()).default([]),
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

	const findPrevious = () =>
		db
			.prepare(
				'SELECT id,display_number AS displayNumber,total_minor AS totalMinor,currency,status FROM orders WHERE table_id=? AND idempotency_key=?',
			)
			.bind(table.id, parsed.data.idempotencyKey)
			.first();
	const previous = await findPrevious();
	if (previous) return json({ order: previous, idempotent: true });

	const ids = [...new Set(parsed.data.lines.map((line) => line.itemId))];
	const marks = ids.map(() => '?').join(',');
	const items = await db
		.prepare(`SELECT i.id,i.name,i.allergy_note,
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
		}>();
	if (items.results.length !== ids.length)
		return json({ message: 'A dish changed; refresh.' }, { status: 409 });

	let total = 0;
	const lines: Array<{
		item: (typeof items.results)[number];
		quantity: number;
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
		const lineTotal = (item.unit + delta) * wanted.quantity;
		total += lineTotal;
		lines.push({ item, quantity: wanted.quantity, total: lineTotal, choices });
	}

	const sequence = await db
		.prepare(`INSERT INTO order_sequences(restaurant_id,next_number) VALUES(?,2)
		ON CONFLICT(restaurant_id) DO UPDATE SET next_number=order_sequences.next_number+1
		RETURNING next_number-1 AS n`)
		.bind(table.restaurant_id)
		.first<{ n: number }>();
	const next = sequence!.n;
	const orderId = crypto.randomUUID();
	const statements = [
		db
			.prepare(
				'INSERT INTO orders(id,restaurant_id,display_number,table_id,idempotency_key,total_minor,currency,note) VALUES(?,?,?,?,?,?,?,?)',
			)
			.bind(
				orderId,
				table.restaurant_id,
				next,
				table.id,
				parsed.data.idempotencyKey,
				total,
				table.currency,
				parsed.data.note ?? null,
			),
	];
	for (const line of lines) {
		const lineId = crypto.randomUUID();
		const allergySnapshot =
			[line.item.allergy_note, line.item.allergens].filter(Boolean).join(' · ') || null;
		statements.push(
			db
				.prepare(
					'INSERT INTO order_lines(id,order_id,item_id,item_name,unit_minor,quantity,total_minor,promotion_label,allergy_snapshot) VALUES(?,?,?,?,?,?,?,?,?)',
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
		if (raced) return json({ order: raced, idempotent: true });
		throw cause;
	}

	await platform!.env.ORDER_HUB.getByName(table.restaurant_id)
		.fetch('https://order-hub/publish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'order.created', orderId, version: 1 }),
		})
		.catch(() => null);
	return json({
		order: {
			id: orderId,
			displayNumber: next,
			totalMinor: total,
			currency: table.currency,
			status: 'new',
		},
	});
};
