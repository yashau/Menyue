# Menyue

Restaurant menu CMS and table-ordering application built with SvelteKit, Cloudflare Workers, D1, R2, Durable Objects, Tailwind CSS v4, and shadcn-svelte.

## Local setup

```powershell
pnpm install
$env:AUTH_PEPPER = "<long random local secret>"
pnpm migrate:local
pnpm bootstrap:local -- admin "<12+ character staff password>" "<12+ character counter password>"
pnpm dev
```

Also put the same `AUTH_PEPPER` in an ignored `.dev.vars` file for local Worker development.

- Public menu: `/`
- Table ordering: `/t/[token]`
- Admin: `/admin/login`
- Counter: `/counter/login`

## Validation

```powershell
pnpm lint
pnpm check
pnpm test
pnpm build
```

See [docs/implementation-log.md](docs/implementation-log.md) for Cloudflare bindings, shadcn-svelte provenance, and deployment prerequisites.
