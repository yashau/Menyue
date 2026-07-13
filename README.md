# Menyue

Restaurant menu CMS and table-ordering application built with SvelteKit, Cloudflare Workers, D1, R2, Durable Objects, Tailwind CSS v4, and shadcn-svelte.

## Local setup

```powershell
pnpm install
pnpm dev
```

`pnpm dev` uses Miniflare through Wrangler and the Cloudflare adapter. On first run it:

- creates an ignored `.dev.vars` containing a random local `AUTH_PEPPER`;
- applies all D1 migrations into persistent `.wrangler/state` storage;
- seeds a sample menu, combo, promotion, allergens, and Table 1;
- builds the SvelteKit Worker and serves it with the realtime Durable Object Worker in one
  production-faithful Wrangler/Miniflare runtime. The built Worker is the only process bound to
  port 5173; Vite is used only for the build step.

Rerun `pnpm dev` after source changes to rebuild and restart the local runtime.

Local test entry points and credentials:

- Public menu: <http://localhost:5173/>
- Table ordering: <http://localhost:5173/t/table-one-local>
- Admin: <http://localhost:5173/admin/login> — `admin` / `menyue-admin-local`
- Counter: <http://localhost:5173/counter/login> — `counter` / `menyue-counter-local` (local fixture only)

Run `pnpm dev:reset` to clear and reseed local D1, R2, and Durable Object state. `pnpm dev:setup`
is idempotent and can be run without starting the servers.

`pnpm dev` refuses to start if another process already owns port 5173; it never stops a foreign
process. `pnpm test:dev-lifecycle` proves two clean start/stop cycles and that port-conflict
behavior. `pnpm test:local-runtime` starts a test-owned runtime, verifies localhost and the
detected private LAN IPv4 origin, restores its test order, and stops the runtime.

These credentials and the table token are for local development only.
The runtime listens on `0.0.0.0`; devices on the same network can use
`http://<this-computer's-LAN-IP>:5173`.

## Validation

```powershell
pnpm lint
pnpm check
pnpm test
pnpm build
```

See [docs/implementation-log.md](docs/implementation-log.md) for Cloudflare bindings, shadcn-svelte provenance, and deployment prerequisites.
