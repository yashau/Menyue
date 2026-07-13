import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = join(process.cwd(), 'migrations');

async function migratedDatabase() {
	const database = new DatabaseSync(':memory:');
	const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
	for (const migration of migrations)
		database.exec(await readFile(join(migrationsDirectory, migration), 'utf8'));
	return database;
}

describe('counter durability and projection migration', () => {
	it('enforces one durable event per counter transition', async () => {
		const database = await migratedDatabase();
		try {
			database.exec(`
				INSERT INTO restaurants(id) VALUES ('migration-test');
				INSERT INTO dining_tables(id,restaurant_id,label,token_hash,token_hint) VALUES ('table','migration-test','1','token','hint');
				INSERT INTO orders(id,restaurant_id,display_number,table_id,idempotency_key,total_minor,currency)
				VALUES ('order','migration-test',1,'table','request',100,'USD');
				INSERT INTO order_events(id,order_id,type,payload_json,transition_key)
				VALUES ('event-1','order','order.status.updated','{}','order:1:accepted');
				INSERT OR IGNORE INTO order_events(id,order_id,type,payload_json,transition_key)
				VALUES ('event-2','order','order.status.updated','{}','order:1:accepted');
			`);
			expect(database.prepare("SELECT count(*) AS count FROM order_events WHERE transition_key='order:1:accepted'").get()).toEqual({ count: 1 });
		} finally {
			database.close();
		}
	});

	it('uses the counter selection and child projection indexes in SQLite query plans', async () => {
		const database = await migratedDatabase();
		try {
			const details = (sql: string) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()
				.map((row) => String((row as { detail: string }).detail)).join('\n');
			expect(details("SELECT id FROM orders WHERE restaurant_id='demo' AND status IN ('new','accepted','preparing','ready') ORDER BY status,updated_at DESC,display_number DESC"))
				.toContain('orders_counter_status_updated_idx');
			expect(details("SELECT id FROM order_lines WHERE order_id='order'")).toContain('order_lines_order_idx');
			expect(details("SELECT id FROM order_line_choices WHERE line_id='line'")).toContain('order_line_choices_line_idx');
		} finally {
			database.close();
		}
	});
});
