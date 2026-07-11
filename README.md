# Menyue

A mobile-first restaurant **menu, table-ordering, counter operations, and administration** platform. Guests open a table-specific link on their phone, browse a large visual menu, customise items, and send an order straight to the counter. Staff run a live order board and a full publishing/admin workspace.

Built with **SvelteKit (Svelte 5) · TypeScript · Cloudflare Workers · D1 · Tailwind CSS v4**.

---

## Quick start

```bash
pnpm install
pnpm db:reset      # fresh migrate + seed (120+ items, 18 categories, currencies, users, tables)
pnpm dev           # http://0.0.0.0:5290
```

The dev server listens on **0.0.0.0:5290** so you can open it from a phone on the same Wi‑Fi.

### Sign-in (seeded)

| Role      | Username  | Password         | Lands on   |
| --------- | --------- | ---------------- | ---------- |
| Admin     | `admin`   | `menyue-admin`   | `/admin`   |
| Manager   | `manager` | `menyue-manager` | `/admin`   |
| Counter   | `counter` | `menyue-counter` | `/counter` |

Staff surfaces (`/login`, `/admin`, `/counter`) are reached by URL/bookmark — they are intentionally **not linked from the customer-facing pages**.

### Guest menu

Every table has an opaque token link, e.g. `/t/tbl_01_3c47d1aa629f57a3` (Table 1). Copy real links from **Admin → Tables**.

---

## What's inside

- **Guest menu** — 120+ items, sticky search across names/descriptions/tags/allergens/dietary, category rail (rail on desktop, chips on mobile) with active tracking, per-restaurant currency switching with live/stale/fallback rate attribution.
- **Customization wizard** — accessible 3-step dialog (options → suggestions → review), required/optional groups with min/max & explicit “None”, price adjustments, nested customization for suggested items, focus trap + Escape + restore, one atomic cart update.
- **Cart & checkout** — quantities, notes, edit lines, base + converted totals, configurable final beverage prompt, **server-authoritative repricing**, server-issued **idempotency keys** (retry-safe, rotated after success), large confirmation dialog.
- **Counter board** — dark, high-contrast board; New / Accepted / Preparing / Completed columns (segmented on mobile), live polling, new-order alerts, immutable order totals, confirmed cancellation.
- **Admin workspace** — dashboard, menu items (CRUD, availability/enable toggles, suggestions, option-group overview, custom photos), categories, tables (safe link generation — never leaks `0.0.0.0`), staff accounts, and admin-only **Global settings**.
- **Global settings (admin-only)** — brand colours (re-skin the whole app), base currency + conversion mode, display currencies, exchange-rate status/refresh (cache-only render, 24h fresh / 72h last-known-good / fixed fallback, atomic refresh lease, allowlisted provider), and the beverage prompt. Managers get a genuine **HTTP 403**.
- **Branding** — each restaurant's primary/accent colours drive CSS-variable ramps, so one setting re-skins customer, counter and admin. Items can use custom photo URLs, falling back to a self-contained procedural illustration (no broken assets, works offline / on plain-HTTP LAN).

## Security & integrity

Server-side role enforcement · restaurant-scoped queries · CSRF (session token + same-origin) · secure session cookies (HTTP-LAN compatible) · server-side repricing & modifier/availability validation · table-token validation · idempotent order creation · immutable historical money snapshots · allowlisted exchange provider · audited sensitive mutations.

---

## Gates

```bash
pnpm lint          # svelte-kit sync + svelte-check (types + a11y)
pnpm test:unit     # Vitest (money + wizard logic)
pnpm build         # production build (adapter-cloudflare)
pnpm gates         # lint + unit + build
pnpm test:e2e      # Playwright (Chromium) — see note below
```

### Running Playwright

The local D1 is a single on-disk SQLite; **only one dev server may own it at a time**. Make sure nothing else is bound to port 5290, then:

```bash
pnpm test:e2e
```

Playwright starts and warms its own dev server on `127.0.0.1:5290`. Verified widths: 320 / 375 / 390 / 412 / 768 / 1440. The suite covers the full guest order flow, the beverage prompt, idempotent lost-response retry + a distinct second order, counter transitions, admin role 403s, responsive overflow + 44px touch targets, and modal focus/Escape.

## Project layout

```
migrations/            D1 schema (0001 init, 0002 branding)
scripts/seed.mjs       deterministic demo dataset
scripts/reset.mjs      fresh migrate + seed (migration smoke)
src/lib/server/        db, auth, currency, menu, orders, guest, order engine
src/lib/components/     ui primitives + menu components
src/routes/t/[token]/  guest menu + order/key endpoints
src/routes/counter/    counter board
src/routes/admin/      admin workspace
src/routes/img/[seed]/ procedural food imagery
e2e/                   Playwright specs
```
