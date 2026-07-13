# Customer/table evidence

Start the temporary local runtime with `pnpm dev`, then run the authoritative capture with:

```powershell
node scripts/capture-authoritative-evidence.mjs
```

The capture is fail-closed. It requires the customer and table routes, required menu/media probes,
all browser-error channels, visible customer controls/content, USD (`en-US`) plus EUR/GBP display
switching, no horizontal overflow, ordering-flow flags, idempotency replay, cleanup, and a clean
stale-term scan to pass on every captured page.

Runtime topology is measured rather than assumed: port 5173 must accept loopback and every active
private-LAN IPv4 address; realtime port 8788 must accept loopback but reject those LAN addresses;
and port 4173 must be closed. The manifest records the actual listener probes, reachable and
unreachable host inventory, and any stale address measurements.

With the current three-host inventory (`localhost` plus the active private addresses), the capture
produces 18 page PNGs (2 routes × 3 widths × 3 hosts) and 3 ordering-flow PNGs beneath
`test-results/artifacts/authoritative/`. Do not run `pnpm preview`; 4173 being open invalidates
the evidence. Stop the temporary `pnpm dev` process when finished.
