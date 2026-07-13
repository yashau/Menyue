import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFile(resolve(root, path), 'utf8');

async function migratedDatabase() {
	const database = new DatabaseSync(':memory:');
	for (const file of (await readdir(join(root, 'migrations'))).filter((name) => name.endsWith('.sql')).sort())
		database.exec(await readFile(join(root, 'migrations', file), 'utf8'));
	return database;
}

describe('counter operator security boundaries', () => {
	it('stores per-tenant operator hashes and preserves username isolation', async () => {
		const database = await migratedDatabase();
		try {
			database.exec(`
				INSERT INTO restaurants(id) VALUES ('one'),('two');
				INSERT INTO counter_operators(id,restaurant_id,normalized_username,display_name,password_hash,salt,iterations)
				VALUES ('one-counter','one','service','One','hash-one','salt-one',210000),
				       ('two-counter','two','service','Two','hash-two','salt-two',210000);
			`);
			expect(database.prepare("SELECT id FROM counter_operators WHERE restaurant_id='one' AND normalized_username='service'").get()).toEqual({ id: 'one-counter' });
			expect(() => database.exec("INSERT INTO counter_operators(id,restaurant_id,normalized_username,display_name,password_hash,salt,iterations) VALUES ('duplicate','one','service','Again','hash','salt',210000)")).toThrow();
		} finally { database.close(); }
	});

	it('uses only hashed counter session storage and invalidates disabled or reset principals', async () => {
		const [auth, hooks, operators] = await Promise.all([source('src/lib/server/auth.ts'), source('src/hooks.server.ts'), source('src/routes/admin/counter-operators/+page.server.ts')]);
		expect(auth).toContain('await sha256(value)');
		expect(auth).toContain("'counter',");
		expect(hooks).toContain('FROM counter_operators WHERE id=?');
		expect(hooks).toContain('operator?.enabled && operator.auth_version === session.auth_version');
		expect(operators).toContain("DELETE FROM sessions WHERE principal_type='counter' AND principal_id=?");
		expect(operators).toContain('auth_version=auth_version+1');
	});

	it('binds board access and order changes to the authenticated operator tenant', async () => {
		const [login, page, orders, patch] = await Promise.all([source('src/routes/counter/login/+page.server.ts'), source('src/routes/counter/+page.server.ts'), source('src/routes/api/counter/orders/+server.ts'), source('src/routes/api/counter/orders/[id]/+server.ts')]);
		expect(login).toContain('restaurant_id=? AND normalized_username=?');
		expect(login).toContain("message: 'Invalid counter password.'");
		expect(page).toContain('locals.counter.restaurantId');
		expect(orders).toContain('locals.counter.restaurantId');
		expect(patch).toContain('event.locals.counter.restaurantId');
	});

	it('records status actor metadata and rejects cross-origin CSRF requests', async () => {
		const [migration, patch, auth] = await Promise.all([source('migrations/0016_counter_operators_and_event_actors.sql'), source('src/routes/api/counter/orders/[id]/+server.ts'), source('src/lib/server/auth.ts')]);
		expect(migration).toContain('ADD COLUMN actor_id TEXT');
		expect(migration).toContain('ADD COLUMN actor_name TEXT');
		expect(migration).toContain('ADD COLUMN actor_type TEXT');
		expect(patch).toContain('actor: { id: event.locals.counter.operatorId');
		expect(patch).toContain('actor_name,actor_type');
		expect(auth).toContain("headers.get('origin') ?? event.request.headers.get('referer')");
		expect(auth).toContain('Invalid request origin.');
	});
});
