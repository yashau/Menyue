<script lang="ts">
	import { onMount } from 'svelte';
	import type { BoardOrder } from '$lib/server/orders';
	import type { OrderStatus } from '$lib/types';
	import { formatBaseMinor } from '$lib/money';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import Store from '@lucide/svelte/icons/store';
	import Bell from '@lucide/svelte/icons/bell';
	import Check from '@lucide/svelte/icons/check';

	let { data } = $props();

	let orders = $state<BoardOrder[]>(data.orders);
	let nowTs = $state(Math.floor(Date.now() / 1000));
	let lastUpdated = $state(Math.floor(Date.now() / 1000));
	let seenNewIds = new Set(data.orders.filter((o) => o.status === 'new').map((o) => o.id));
	let newAlert = $state(0);
	let busyId = $state<number | null>(null);
	let confirm = $state<{ order: BoardOrder } | null>(null);

	// Rolling 24h window — shifts can run past midnight, so the board shows any
	// order from the last 24 hours. Recomputes each clock tick as `nowTs` advances.
	const WINDOW_SECONDS = 24 * 60 * 60;
	const recentOrders = $derived(orders.filter((o) => o.createdAt >= nowTs - WINDOW_SECONDS));

	const money = (m: number) => formatBaseMinor(m, data.base);

	// Per-stage styling — colour-coded so staff scan the board by stage. Colours
	// are light/dark-safe (Tailwind palettes with dark: variants driven by the
	// system theme); the surfaces themselves use the neutral shadcn tokens.
	const STAGE: Record<
		OrderStatus,
		{ label: string; weight: number; chip: string; bar: string; dim: boolean; dot: string }
	> = {
		new: {
			label: 'New',
			weight: 0,
			chip: 'border-red-500/25 bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
			bar: 'bg-red-500',
			dim: false,
			dot: 'bg-red-500'
		},
		accepted: {
			label: 'Accepted',
			weight: 1,
			chip: 'border-amber-500/25 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
			bar: 'bg-amber-500',
			dim: false,
			dot: 'bg-amber-500'
		},
		preparing: {
			label: 'Preparing',
			weight: 2,
			chip: 'border-sky-500/25 bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
			bar: 'bg-sky-500',
			dim: false,
			dot: 'bg-sky-500'
		},
		completed: {
			label: 'Completed',
			weight: 3,
			chip: 'border-emerald-500/25 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
			bar: 'bg-emerald-500',
			dim: true,
			dot: 'bg-emerald-500'
		},
		cancelled: {
			label: 'Cancelled',
			weight: 4,
			chip: 'border-border bg-muted text-muted-foreground',
			bar: 'bg-border',
			dim: true,
			dot: 'bg-muted-foreground/50'
		}
	};
	const STAGE_ORDER: OrderStatus[] = ['new', 'accepted', 'preparing', 'completed', 'cancelled'];

	// Clickable status filters — everything except completed/cancelled on by default.
	let selected = $state<Record<OrderStatus, boolean>>({
		new: true,
		accepted: true,
		preparing: true,
		completed: false,
		cancelled: false
	});
	function toggle(s: OrderStatus) {
		selected[s] = !selected[s];
	}

	const counts = $derived({
		new: recentOrders.filter((o) => o.status === 'new').length,
		accepted: recentOrders.filter((o) => o.status === 'accepted').length,
		preparing: recentOrders.filter((o) => o.status === 'preparing').length,
		completed: recentOrders.filter((o) => o.status === 'completed').length,
		cancelled: recentOrders.filter((o) => o.status === 'cancelled').length
	});

	// One condensed list: selected stages, active first, oldest-first (FIFO) within a stage.
	const baseSorted = $derived(
		recentOrders
			.filter((o) => selected[o.status])
			.slice()
			.sort((a, b) => STAGE[a.status].weight - STAGE[b.status].weight || a.createdAt - b.createdAt)
	);

	// After an action we "pin" the current positions for a few seconds so a card
	// doesn't jump away under the staff member's finger (e.g. accept then start
	// preparing the same order). New orders append; nothing above shifts.
	const PIN_MS = 6000;
	let pinnedIds = $state<number[] | null>(null);
	let pinTimer: ReturnType<typeof setTimeout> | undefined;
	function pinOrder() {
		pinnedIds = visibleOrders.map((o) => o.id);
		clearTimeout(pinTimer);
		pinTimer = setTimeout(() => (pinnedIds = null), PIN_MS);
	}

	const visibleOrders = $derived.by(() => {
		if (!pinnedIds) return baseSorted;
		const pos = new Map(pinnedIds.map((id, i) => [id, i]));
		return baseSorted
			.slice()
			.sort((a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER));
	});

	function ageLabel(o: BoardOrder): string {
		const secs = Math.max(0, nowTs - o.createdAt);
		if (secs < 60) return 'just now';
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ${mins % 60}m ago`;
	}
	function ageTone(o: BoardOrder): string {
		if (o.status !== 'new') return 'text-muted-foreground';
		const mins = (nowTs - o.createdAt) / 60;
		if (mins >= 10) return 'font-bold text-red-600 dark:text-red-400';
		if (mins >= 5) return 'font-semibold text-amber-600 dark:text-amber-400';
		return 'text-muted-foreground';
	}

	async function refresh() {
		try {
			const res = await fetch('/counter/orders');
			if (!res.ok) return;
			const body = (await res.json()) as { orders: BoardOrder[]; serverTime: number };
			let fresh = 0;
			for (const o of body.orders) {
				if (o.status === 'new' && o.createdAt >= nowTs - WINDOW_SECONDS && !seenNewIds.has(o.id)) {
					seenNewIds.add(o.id);
					fresh += 1;
				}
			}
			if (fresh > 0) newAlert += fresh;
			orders = body.orders;
			lastUpdated = Math.floor(Date.now() / 1000);
		} catch {
			/* keep last snapshot */
		}
	}

	async function setStatus(order: BoardOrder, status: OrderStatus) {
		pinOrder();
		busyId = order.id;
		try {
			const res = await fetch('/counter/status', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-csrf': data.csrf },
				body: JSON.stringify({ orderId: order.id, status })
			});
			if (res.ok) {
				orders = orders.map((o) => (o.id === order.id ? { ...o, status } : o));
			}
			await refresh();
		} finally {
			busyId = null;
		}
	}

	function requestCancel(order: BoardOrder) {
		confirm = { order };
	}
	async function confirmCancel() {
		if (!confirm) return;
		const order = confirm.order;
		confirm = null;
		await setStatus(order, 'cancelled');
	}

	onMount(() => {
		const poll = setInterval(refresh, 5000);
		const clock = setInterval(() => (nowTs = Math.floor(Date.now() / 1000)), 1000);
		return () => {
			clearInterval(poll);
			clearInterval(clock);
			clearTimeout(pinTimer);
		};
	});
</script>

<svelte:head><title>Counter · {data.orders.length} orders</title></svelte:head>

<div class="min-h-svh bg-background text-foreground" style="color-scheme: light dark">
	<!-- Top bar -->
	<header class="sticky top-0 z-30 border-b border-border bg-background/90 px-4 py-3 pt-safe-header backdrop-blur">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				{#if data.brand.logoKey}
					<img src={`/media/${data.brand.logoKey}`} alt="" class="size-9 shrink-0 rounded-md object-cover" />
				{:else}
					<span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<Store class="size-5" />
					</span>
				{/if}
				<div>
					<h1 class="text-base font-semibold leading-none">{data.brand.name}</h1>
					<p class="mt-1 text-xs text-muted-foreground">
						Updated {Math.max(0, nowTs - lastUpdated)}s ago · {counts.new + counts.accepted + counts.preparing} active
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				{#if newAlert > 0}
					<Button
						size="sm"
						onclick={() => (newAlert = 0)}
						class="animate-pulse border-transparent bg-red-600 text-white hover:bg-red-600/90"
						data-testid="new-order-alert"
					>
						<Bell /> {newAlert} new
					</Button>
				{/if}
				<span class="hidden text-sm text-muted-foreground sm:inline">{data.user.displayName}</span>
				<form method="POST" action="/logout">
					<Button type="submit" variant="outline" size="sm">Sign out</Button>
				</form>
			</div>
		</div>
	</header>

	<!-- Clickable status filters (muted when unselected) -->
	<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-3">
		{#each STAGE_ORDER as s (s)}
			<button
				type="button"
				onclick={() => toggle(s)}
				aria-pressed={selected[s]}
				class="inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors
					{selected[s] ? STAGE[s].chip : 'border-border bg-transparent text-muted-foreground hover:bg-muted'}"
				data-testid="filter-{s}"
			>
				<span class="size-2 shrink-0 rounded-full {selected[s] ? STAGE[s].dot : 'bg-muted-foreground/30'}"></span>
				<span>{STAGE[s].label}</span>
				<span class="tabular-nums opacity-70">{counts[s]}</span>
			</button>
		{/each}
	</div>

	<!-- Condensed board: masonry — cards size to their content and auto-place -->
	<div class="mx-auto max-w-7xl p-4">
		{#if visibleOrders.length}
			<div class="columns-1 gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3 xl:columns-4">
				{#each visibleOrders as order (order.id)}
					{@render card(order)}
				{/each}
			</div>
		{:else}
			<div class="rounded-xl border border-dashed border-border py-20 text-center">
				<p class="text-xl font-semibold">No active orders</p>
				<p class="mt-1 text-sm text-muted-foreground">New orders appear here automatically.</p>
			</div>
		{/if}
	</div>
</div>

{#snippet card(order: BoardOrder)}
	<Card.Root
		class="relative mb-4 gap-0 break-inside-avoid py-0 shadow-sm {STAGE[order.status].dim ? 'opacity-70' : ''}"
		data-testid="order-card"
		data-order-status={order.status}
	>
		<div class="absolute inset-y-0 left-0 z-10 w-1 {STAGE[order.status].bar}"></div>

		<Card.Content class="p-3.5 pl-4">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<span
						class="mb-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {STAGE[
							order.status
						].chip}"
					>
						{STAGE[order.status].label}
					</span>
					<div class="text-xl font-bold leading-none">{order.number}</div>
					<div class="mt-1 text-[13px] text-muted-foreground">{order.tableLabel}</div>
				</div>
				<div class="shrink-0 text-right text-xs {ageTone(order)}">{ageLabel(order)}</div>
			</div>

			<ul class="mt-3.5 flex flex-col gap-2 border-t border-border pt-3.5">
				{#each order.items as it}
					<li class="text-sm">
						<div class="flex gap-2">
							<span class="font-semibold text-primary">{it.quantity}×</span>
							<span class="min-w-0 flex-1 font-medium">
								{it.name}
								{#if it.isSuggested}<span class="ml-1 align-middle text-[10px] font-semibold uppercase text-muted-foreground">add-on</span>{/if}
							</span>
						</div>
						{#each it.options as o}
							<div class="pl-6 text-xs text-muted-foreground">{o.groupName}: {o.choiceName}</div>
						{/each}
						{#if it.notes}
							<div class="mt-0.5 pl-6 text-xs italic text-amber-600 dark:text-amber-400">"{it.notes}"</div>
						{/if}
					</li>
				{/each}
			</ul>

			{#if order.notes}
				<div class="mt-2.5 rounded-lg border border-amber-500/25 bg-amber-100 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
					Note: {order.notes}
				</div>
			{/if}

			<div class="mt-3.5 flex items-center justify-between gap-2 border-t border-border pt-3.5">
				<span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total</span>
				<span class="whitespace-nowrap text-lg font-bold">{money(order.totalBase)}</span>
			</div>

			<div class="mt-3 flex gap-2">
				{#if order.status === 'new'}
					<Button class="h-10 flex-1" disabled={busyId === order.id} onclick={() => setStatus(order, 'accepted')} data-testid="accept-btn">Accept</Button>
					<Button variant="outline" class="h-10" onclick={() => requestCancel(order)}>Cancel</Button>
				{:else if order.status === 'accepted'}
					<Button class="h-10 flex-1" disabled={busyId === order.id} onclick={() => setStatus(order, 'preparing')} data-testid="prepare-btn">Start preparing</Button>
					<Button variant="outline" class="h-10" onclick={() => requestCancel(order)}>Cancel</Button>
				{:else if order.status === 'preparing'}
					<Button class="h-10 flex-1" disabled={busyId === order.id} onclick={() => setStatus(order, 'completed')} data-testid="complete-btn">Complete</Button>
					<Button variant="outline" class="h-10" onclick={() => requestCancel(order)}>Cancel</Button>
				{:else if order.status === 'completed'}
					<div class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
						<Check class="size-4" /> Completed
					</div>
				{:else}
					<div class="flex h-10 flex-1 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">Cancelled</div>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
{/snippet}

<Dialog.Root open={!!confirm} onOpenChange={(v) => { if (!v) confirm = null; }}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Cancel {confirm?.order.number}?</Dialog.Title>
			<Dialog.Description>
				This cannot be undone. The guest at {confirm?.order.tableLabel} will need to reorder.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" class="flex-1" onclick={() => (confirm = null)}>Keep order</Button>
			<Button variant="destructive" class="flex-1" onclick={confirmCancel} data-testid="confirm-cancel">Cancel order</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
