# Menyue implementation log

## Stack and provenance

- Scaffolded with `pnpm dlx sv@0.16.2 create . --template minimal --types ts --add eslint vitest="usages:unit" tailwindcss="plugins:none" sveltekit-adapter="adapter:cloudflare+cfTarget:workers" --install pnpm`.
- The Cloudflare adapter, Tailwind v4 Vite integration, Vitest, and the original ESLint setup came from that Svelte CLI invocation.
- ESLint was replaced with Oxlint and Oxfmt. `oxlint-tailwindcss` validates Tailwind v4 classes against `src/routes/layout.css`, and Oxfmt handles Svelte formatting and Tailwind class ordering.
- `lucide-svelte@1.0.1` is installed for the requested icon package.
- Exact shadcn-svelte registry CLI: `shadcn-svelte@1.4.1`.
- Registry initialization: `pnpm dlx shadcn-svelte@1.4.1 init --preset b1VlIttI --css src/routes/layout.css --components-alias '$lib/components' --lib-alias '$lib' --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui' --reinstall` (the encoded preset is the official CLI's Luma/Lucide/Inter preset).
- Registry add command: `pnpm dlx shadcn-svelte@1.4.1 add button input textarea label field switch select card badge separator table tabs dialog alert-dialog dropdown-menu sheet sidebar sonner tooltip skeleton -y`.
- Verified generated registry output under `src/lib/components/ui/` and imports from `$lib/components/ui/...`; the CLI also generated `components.json`, `$lib/utils`, hooks and required dependencies.

## Local setup

1. Create an ignored `.dev.vars` file containing `AUTH_PEPPER="<a long random local secret>"`. Set the same value in the shell before bootstrapping (`$env:AUTH_PEPPER="..."` in PowerShell). Never commit it.
2. Run `pnpm migrate:local` to create the local D1 schema.
3. Run `pnpm bootstrap:local -- admin <12+ character staff password>`.
4. Sign in at `/admin/login`, change the temporary password, then create a tenant-scoped counter operator at `/admin/counter-operators`. There is no shared or default production counter password. The bootstrap refuses to replace an existing enabled admin and marks the first password as temporary.

### Counter operator migration

Migration `0016_counter_operators_and_event_actors.sql` retires the shared credential from the login path without deleting its historical row. Before or immediately after applying it, an enabled administrator must create at least one operator for each restaurant through `/admin/counter-operators`; until then counter login intentionally returns a generic failure. Each operator is tenant-scoped, PBKDF2+`AUTH_PEPPER` hashed, and can be disabled, reset, or have sessions revoked from that page.

For real Cloudflare environments, replace the placeholder D1 database ID and bucket name, configure the required `AUTH_PEPPER` Worker secret, then generate bindings with `pnpm gen`; deployment is deliberately outside this repository task.

## Limits of local-only mode

- No deployment, database, bucket, or Durable Object resource was created.
- The app falls back to a safe demo menu before migrations/data are present; privileged routes still require database-backed credentials.
- Realtime Worker wiring is configured and the counter has reconciliation API support. A local multi-worker session is required to exercise WebSocket broadcast delivery.
