<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { counterConnectionState, createCounterArrivalTracker } from '$lib/counter-feed';
	import { clientMoney } from '$lib/currency';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { PageData } from './$types';
	type CounterStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';
	type CounterOrder = {
		id: string; display_number: number; status: CounterStatus; note: string | null; total_minor: number; currency: string; version: number; created_at: string; updated_at: string; label: string; currency_minor_unit: number; currency_locale: string;
		totals: Array<{ currency: string; total_minor: number; minor_unit: number; locale: string }>;
		lines: Array<{ id: string; item_id: string; item_name: string; unit_minor: number; quantity: number; total_minor: number; note: string | null; choices: Array<{ group_name: string; choice_name: string; price_delta_minor: number }> }>;
	};
	const counterTransitions: Record<CounterStatus, CounterStatus[]> = {
		new: ['accepted', 'cancelled'], accepted: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['completed', 'cancelled'], completed: [], cancelled: [],
	};
	const statusLabels: Record<CounterStatus, string> = {
		new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
	};
	const statusOrder: CounterStatus[] = ['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];

	let { data }: { data: PageData } = $props();
	const initialOrders = data.orders as CounterOrder[];
	let orders = $state<CounterOrder[]>(initialOrders);
	let connected = $state(false);
	let pollingFallbackActive = $state(false);
	let loading = $state(true);
	let refreshing = $state(false);
	let message = $state('');
	let selectedStatuses = $state<Record<CounterStatus, boolean>>({
		new: true, accepted: true, preparing: true, ready: true, completed: false, cancelled: false,
	});
	let boardView = $state<'queue' | 'lanes'>('queue');
	let query = $state('');
	let busyOrderIds = $state(new Set<string>());
	let cancelTarget = $state<CounterOrder | null>(null);
	let cancelDialogOpen = $state(false);
	let cancelSubmitting = $state(false);
	let cancelDialogError = $state('');
	let lastUpdated = $state<Date | null>(new Date());
	let lastSnapshotAt = $state<Date | null>(new Date());
	let lastTransportActivityAt = $state<Date | null>(new Date());
	let snapshotValid = $state(true);
	let feedClock = $state(Date.now());
	let refreshPromise: Promise<boolean> | null = null;
	let announcement = $state('');
	let newOrderAlerts = $state<CounterOrder[]>([]);
	let highlightedOrderId = $state<string | null>(null);
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;
	const arrivalTracker = createCounterArrivalTracker(initialOrders);

	const csrf = () =>
		document.cookie.split('; ').find((part) => part.startsWith('menyue_csrf='))?.split('=')[1] ?? '';
	const active = (order: CounterOrder) => !['completed', 'cancelled'].includes(order.status);
	const isBusy = (orderId: string) => busyOrderIds.has(orderId);
	const actionsUnavailable = () => !snapshotValid;
	const counts = () => Object.fromEntries(statusOrder.map((status) => [status, orders.filter((order) => order.status === status).length])) as Record<CounterStatus, number>;
	const orderSearchText = (order: CounterOrder) => [
		String(order.display_number), order.label, order.note ?? '',
		...order.lines.flatMap((line) => [
			line.item_name, line.note ?? '', ...line.choices.flatMap((choice) => [choice.group_name, choice.choice_name]),
		]),
	].join(' ').toLocaleLowerCase();
	const visibleOrders = () => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return orders.filter((order) => selectedStatuses[order.status] && (!normalizedQuery || orderSearchText(order).includes(normalizedQuery)));
	};
	const laneOrders = (status: CounterStatus) => visibleOrders()
		.filter((order) => order.status === status)
		.sort((a, b) => a.created_at.localeCompare(b.created_at));
	const isVisibleInQueue = (order: CounterOrder) => selectedStatuses[order.status] && (!query.trim() || orderSearchText(order).includes(query.trim().toLocaleLowerCase()));
	const connectionState = () => counterConnectionState({ socketConnected: connected, pollingFallbackActive, lastSnapshotAt, snapshotValid, now: feedClock });
	const connectionLabel = () => ({
		live: 'Live',
		reconnecting: 'Reconnecting',
		polling: 'Polling fallback',
		stale: 'Stale',
	}[connectionState()]);
	const connectionDescription = () => {
		const refreshed = lastUpdated ? ` Last successful refresh ${timeLabel(lastUpdated.toISOString())}.` : '';
		return ({
			live: `Live kitchen feed.${refreshed}`,
			reconnecting: `Reconnecting to the kitchen feed.${refreshed}`,
			polling: `Polling fallback is keeping this snapshot current.${refreshed}`,
			stale: `Order snapshot may be stale. Keep this board open and try refreshing.${refreshed}`,
		}[connectionState()]);
	};
	const money = (minor: number, currency: string, unit = 2, locale = 'en-US') =>
		clientMoney(minor, currency, unit, locale);
	const nextAction = (status: CounterStatus) => {
		const target = counterTransitions[status][0];
		return target
			? ({ accepted: 'Accept', preparing: 'Start preparing', ready: 'Mark ready', completed: 'Complete' } as Record<string, string>)[target]
			: null;
	};
	const timeLabel = (timestamp: string) => {
		const date = new Date(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`);
		if (Number.isNaN(date.getTime())) return timestamp;
		const elapsed = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
		const ago = elapsed < 1 ? 'just now' : elapsed === 1 ? '1 min ago' : `${elapsed} min ago`;
		return `${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)} · ${ago}`;
	};
	const exactTimeLabel = (timestamp: string) => {
		const date = new Date(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`);
		return Number.isNaN(date.getTime()) ? timestamp : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
	};
	const ageInfo = (order: CounterOrder) => {
		if (!active(order)) return null;
		const date = new Date(order.created_at.includes('T') ? order.created_at : `${order.created_at.replace(' ', 'T')}Z`);
		const minutes = Number.isNaN(date.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
		if (minutes >= 10) return { tier: 'overdue', label: 'Overdue', description: `${minutes} minutes in queue` };
		if (minutes >= 5) return { tier: 'waiting', label: 'Waiting', description: `${minutes} minutes in queue` };
		return { tier: 'fresh', label: 'Fresh', description: minutes ? `${minutes} minutes in queue` : 'Less than a minute in queue' };
	};
	function toggleStatus(status: CounterStatus) {
		selectedStatuses[status] = !selectedStatuses[status];
	}

	async function focusOrder(orderId: string) {
		const order = orders.find((candidate) => candidate.id === orderId);
		if (!order) return;
		selectedStatuses[order.status] = true;
		query = '';
		await tick();
		const ticket = document.querySelector<HTMLElement>(`[data-order-id="${orderId}"]`);
		ticket?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
		ticket?.focus();
	}

	function scrollBehavior(): ScrollBehavior {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
	}

	function highlightOrder(orderId: string) {
		highlightedOrderId = orderId;
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => {
			if (highlightedOrderId === orderId) highlightedOrderId = null;
		}, 2_500);
	}

	function dismissArrival(orderId: string) {
		newOrderAlerts = newOrderAlerts.filter((order) => order.id !== orderId);
	}

	function beginCancellation(order: CounterOrder) {
		if (!active(order) || isBusy(order.id) || actionsUnavailable()) return;
		cancelTarget = order;
		cancelDialogError = '';
		// Dialog.Trigger toggles during the same activation event. Opening in a
		// microtask preserves its return-focus behavior for both click and Enter.
		queueMicrotask(() => {
			cancelDialogOpen = true;
		});
	}

	function dismissCancellation() {
		if (cancelSubmitting) return;
		cancelDialogOpen = false;
		cancelDialogError = '';
	}

	async function focusAffectedOrder(orderId: string, changedStatus?: string) {
		const order = orders.find((candidate) => candidate.id === orderId);
		if (!order) {
			document.querySelector<HTMLButtonElement>('.counter-refresh')?.focus();
			return;
		}
		highlightOrder(orderId);
		await tick();
		if (!selectedStatuses[order.status]) {
			const filter = document.querySelector<HTMLButtonElement>(`[data-testid="counter-status-${order.status}"]`);
			const statusName = statusLabels[order.status];
			const detail = `Order #${order.display_number}${changedStatus ? ` updated to ${changedStatus}` : ''} is hidden by the ${statusName} filter. Focus moved to that filter.`;
			message = detail;
			announcement = detail;
			filter?.focus();
			return;
		}
		const ticket = document.querySelector<HTMLElement>(`[data-order-id="${orderId}"]`);
		if (!ticket || !isVisibleInQueue(order)) {
			const nextTicket = document.querySelector<HTMLElement>('[data-order-id]');
			const nextControl = nextTicket?.querySelector<HTMLButtonElement>('.ticket-actions button:not(:disabled)');
			const detail = `Order #${order.display_number}${changedStatus ? ` updated to ${changedStatus}` : ''} no longer matches the current search. Focus moved to the next visible ticket.`;
			message = detail;
			announcement = detail;
			(nextControl ?? nextTicket ?? document.querySelector<HTMLInputElement>('[data-testid="counter-search"]') ?? document.querySelector<HTMLButtonElement>('.counter-refresh'))?.focus();
			return;
		}
		ticket.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
		const nextControl = ticket?.querySelector<HTMLButtonElement>('.ticket-actions button:not(:disabled)');
		(nextControl ?? ticket ?? document.querySelector<HTMLButtonElement>('.counter-refresh'))?.focus();
	}

	function focusRefreshControl() {
		document.querySelector<HTMLButtonElement>('.counter-refresh')?.focus();
	}

	function refresh(options: { quiet?: boolean; afterCurrent?: boolean } = {}): Promise<boolean> {
		if (refreshPromise)
			return options.afterCurrent
				? refreshPromise.then(() => refresh({ quiet: options.quiet }))
				: refreshPromise;
		refreshing = true;
		const request = (async () => {
			if (!options.quiet) message = '';
			try {
				const response = await fetch('/api/counter/orders', { headers: { accept: 'application/json' } });
				if (!response.ok) throw new Error(response.status === 401 ? 'Your counter session has ended. Sign in again.' : 'Couldn’t refresh orders.');
				const snapshot = ((await response.json()) as { orders: CounterOrder[] }).orders;
				const arrivals = arrivalTracker.reconcile(snapshot);
				orders = snapshot;
				lastUpdated = new Date();
				lastSnapshotAt = lastUpdated;
				snapshotValid = true;
				if (!connected) pollingFallbackActive = true;
				if (arrivals.length) {
					newOrderAlerts = [...newOrderAlerts, ...arrivals];
					announcement = arrivals.map((order) => `New order #${order.display_number} from ${order.label}.`).join(' ');
				}
				if (!arrivals.length && !options.quiet) announcement = 'Orders refreshed.';
				return true;
			} catch (error) {
				snapshotValid = false;
				message = error instanceof Error && error.message.includes('session')
					? error.message
					: 'Couldn’t refresh orders.';
				announcement = message;
				return false;
			} finally {
				refreshing = false;
				loading = false;
			}
		})();
		refreshPromise = request;
		void request.finally(() => {
			if (refreshPromise === request) refreshPromise = null;
		});
		return request;
	}

	async function updateStatus(order: CounterOrder, status: string, options: { focusAfter?: boolean } = {}) {
		if (isBusy(order.id) || actionsUnavailable()) return 'error' as const;
		busyOrderIds = new Set([...busyOrderIds, order.id]);
		message = '';
		let result: 'updated' | 'conflict' | 'error' | 'stale' = 'error';
		try {
			const response = await fetch(`/api/counter/orders/${order.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
				body: JSON.stringify({ status, version: order.version }),
			});
			const responseBody = (await response.json().catch(() => ({ message: 'Unable to update order.' }))) as {
				message?: string; updated?: boolean; status?: CounterStatus; version?: number;
			};
			if (!response.ok) {
				if (response.status === 409) {
					result = 'conflict';
					snapshotValid = false;
					message = `Order #${order.display_number} changed elsewhere. The latest board has been loaded.`;
					announcement = message;
					return result;
				}
				throw new Error(responseBody.message ?? 'Unable to update order.');
			}
			const returnedStatus = responseBody.status;
			const returnedVersion = responseBody.version;
			if (!responseBody.updated || returnedStatus !== status || typeof returnedVersion !== 'number' || !Number.isInteger(returnedVersion) || returnedVersion <= order.version)
				throw new Error('Order update returned an invalid snapshot.');
			// The mutation response is authoritative for this ticket. The following
			// refresh is still required to validate the rest of the board.
			orders = orders.map((candidate) => candidate.id === order.id && candidate.version === order.version
				? { ...candidate, status: returnedStatus, version: returnedVersion, updated_at: new Date().toISOString() }
				: candidate);
			snapshotValid = false;
			result = 'updated';
			message = `Order #${order.display_number} updated.`;
			announcement = `Order #${order.display_number} updated to ${status}.`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Unable to update order.';
			announcement = message;
		} finally {
			busyOrderIds = new Set([...busyOrderIds].filter((orderId) => orderId !== order.id));
			const refreshed = await refresh({ quiet: true, afterCurrent: true });
			if (!refreshed && (result === 'updated' || result === 'conflict')) {
				const detail = result === 'updated'
					? `Order #${order.display_number} was updated, but this board snapshot is stale. Refresh orders to continue.`
					: `Order #${order.display_number} changed elsewhere, but this board snapshot is stale. Refresh orders to continue.`;
				message = detail;
				announcement = detail;
				result = 'stale';
				await tick();
				focusRefreshControl();
			} else if (options.focusAfter !== false) {
				await focusAffectedOrder(order.id, result === 'updated' ? status : undefined);
			}
		}
		return result;
	}

	async function confirmCancellation() {
		const order = cancelTarget;
		if (!order || cancelSubmitting) return;
		cancelSubmitting = true;
		cancelDialogError = '';
		const result = await updateStatus(order, 'cancelled', { focusAfter: false });
		if (result === 'updated' || result === 'conflict' || result === 'stale') {
			cancelDialogOpen = false;
			cancelTarget = null;
			if (result === 'stale') {
				// Closing the dialog restores focus to its trigger by default; keep a
				// stale board on its refresh control instead of an obsolete action.
				await tick();
				focusRefreshControl();
			} else await focusAffectedOrder(order.id, 'cancelled');
		} else {
			cancelDialogError = 'Cancellation could not be completed. Check the board message and try again.';
		}
		cancelSubmitting = false;
	}

	onMount(() => {
		void refresh({ quiet: true });
		const timer = setInterval(() => void refresh({ quiet: true }), 12_000);
		const healthTimer = setInterval(() => { feedClock = Date.now(); }, 1_000);
		let socket: WebSocket | undefined;
		let stopped = false;
		let retry = 1_000;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		const connect = () => {
			socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/counter/stream`);
			socket.onopen = () => {
				connected = true;
				lastTransportActivityAt = new Date();
				pollingFallbackActive = false;
				retry = 1_000;
			};
			socket.onmessage = () => {
				lastTransportActivityAt = new Date();
				// A websocket payload is only an invalidation; it is not a fresh
				// order snapshot. Keep actions disabled until refresh succeeds.
				snapshotValid = false;
				void refresh({ quiet: true });
			};
			socket.onerror = () => {
				connected = false;
			};
			socket.onclose = () => {
				connected = false;
				if (!stopped) {
					retryTimer = setTimeout(connect, retry);
					retry = Math.min(retry * 2, 15_000);
				}
			};
		};
		connect();
		return () => {
			stopped = true;
			clearInterval(timer);
			clearInterval(healthTimer);
			if (highlightTimer) clearTimeout(highlightTimer);
			if (retryTimer) clearTimeout(retryTimer);
			socket?.close();
		};
	});
</script>

<svelte:head><title>Counter service board · Menyue</title></svelte:head>

<Dialog.Root bind:open={cancelDialogOpen}>
<main class="counter-shell">
	<header class="counter-head">
		<a href="/" class="wordmark">MENYUE</a>
		<div class:stale={connectionState() === 'stale'} class="counter-connection" role="status" aria-live="polite" aria-atomic="true" data-testid="counter-connection">
			<span class:online={connectionState() === 'live'} class="live-dot" aria-hidden="true"></span>
			<strong>{connectionLabel()}</strong><span>{connectionDescription()}</span>
		</div>
		<form method="POST" action="/counter/logout">
			<button class="counter-signout" type="submit">Sign out</button>
		</form>
	</header>

	<section class="counter-title" aria-labelledby="counter-heading">
		<div>
			<p class="eyebrow">Service board</p>
			<h1 id="counter-heading">Keep the room moving.</h1>
			<p>{orders.filter(active).length} active order{orders.filter(active).length === 1 ? '' : 's'} · {lastUpdated ? `updated ${timeLabel(lastUpdated.toISOString())}` : 'loading feed'}</p>
		</div>
		<div class="counter-tools" aria-label="Board controls">
			<div class="counter-view-switcher" role="group" aria-label="Board view">
				<button class:chosen={boardView === 'queue'} class="counter-view-button" type="button" aria-pressed={boardView === 'queue'} data-testid="counter-view-queue" onclick={() => boardView = 'queue'}>Queue</button>
				<button class:chosen={boardView === 'lanes'} class="counter-view-button" type="button" aria-pressed={boardView === 'lanes'} data-testid="counter-view-lanes" onclick={() => boardView = 'lanes'}>Lanes</button>
			</div>
			<button class="counter-refresh" type="button" onclick={() => void refresh()} disabled={refreshing} aria-busy={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh orders'}</button>
		</div>
	</section>
	<section class="counter-queue-controls" aria-label="Queue filters and search">
		<div class="counter-status-rail" role="group" aria-label="Show order statuses">
			{#each statusOrder as status}
				<button
					class:chosen={selectedStatuses[status]}
					class="counter-status-chip"
					type="button"
					aria-pressed={selectedStatuses[status]}
					aria-label={`${selectedStatuses[status] ? 'Hide' : 'Show'} ${statusLabels[status]} orders, ${counts()[status]} total`}
					data-testid={`counter-status-${status}`}
					onclick={() => toggleStatus(status)}
				>
					<span>{statusLabels[status]}</span><strong aria-hidden="true">{counts()[status]}</strong>
				</button>
			{/each}
		</div>
		<label class="counter-search">
			<span>Search orders</span>
			<input bind:value={query} type="search" placeholder="Order, table, item or note" autocomplete="off" data-testid="counter-search" />
		</label>
	</section>

	<div class="counter-feedback">
		{#if message}<p class:counter-error={message.includes('Couldn’t') || message.includes('ended') || message.includes('changed') || message.includes('Unable')}>{message}</p>{/if}
	</div>
	{#if newOrderAlerts.length}
		<section class="counter-arrivals" aria-label="New order alerts">
			{#each newOrderAlerts as order (order.id)}
				<div class="counter-arrival" role="status" aria-live="polite" aria-atomic="true" data-testid="new-order-alert">
					<div><strong>New order #{order.display_number}</strong><span>{order.label}</span></div>
					<div class="counter-arrival-actions">
						<button type="button" onclick={() => void focusOrder(order.id)}>Open ticket</button>
						<button type="button" class="counter-arrival-dismiss" onclick={() => dismissArrival(order.id)} aria-label={`Dismiss new order #${order.display_number} alert`}>Dismiss</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}
	<p class="sr-only" role="status" aria-atomic="true">{announcement}</p>
	{#snippet orderTicket(order: CounterOrder)}
		{@const age = ageInfo(order)}
		<article class:done={!active(order)} class:transitioned={highlightedOrderId === order.id} class="order-ticket" data-testid={`counter-order-${order.id}`} data-order-id={order.id} aria-labelledby={`counter-order-title-${order.id}`} aria-busy={isBusy(order.id)} tabindex="-1">
			<header>
				<div><h2 id={`counter-order-title-${order.id}`}>#{order.display_number}</h2><small>{order.label}</small></div>
				<div class="ticket-status">
					<em aria-label={`Status: ${order.status}`}>{order.status}</em>
					{#if age}<span class={`ticket-age ${age.tier}`} aria-label={`${age.label}: ${age.description}`}><span aria-hidden="true">{age.tier === 'overdue' ? '!' : age.tier === 'waiting' ? '◷' : '•'}</span>{age.label}</span>{/if}
					<time datetime={order.created_at} aria-label={`Placed ${exactTimeLabel(order.created_at)}`} title={exactTimeLabel(order.created_at)}>{timeLabel(order.created_at)}</time>
				</div>
			</header>
			<div class="ticket-lines">
				{#each order.lines as line (line.id)}
					<div class="ticket-line">
						<b>{line.quantity}× {line.item_name}</b>
						<span>{money(line.total_minor, order.currency, order.currency_minor_unit, order.currency_locale)}</span>
						{#each line.choices as choice}<small>{choice.group_name}: {choice.choice_name}{choice.price_delta_minor ? ` (${choice.price_delta_minor > 0 ? '+' : ''}${money(choice.price_delta_minor, order.currency, order.currency_minor_unit, order.currency_locale)})` : ''}</small>{/each}
						{#if line.note}<small class="line-note">Line note: {line.note}</small>{/if}
					</div>
				{/each}
			</div>
			{#if order.note}<p class="ticket-note"><strong>Order note</strong>{order.note}</p>{/if}
			<footer>
				<div class="ticket-total"><strong>{money(order.total_minor, order.currency, order.currency_minor_unit, order.currency_locale)}</strong><span>Total</span></div>
				{#if order.totals.length > 1}<div class="ticket-alternates" aria-label="Alternate totals">{#each order.totals.slice(1) as total}<span>{total.currency} {money(total.total_minor, total.currency, total.minor_unit, total.locale)}</span>{/each}</div>{/if}
				<div class="ticket-actions">
					{#if nextAction(order.status)}<button class="counter-action" type="button" onclick={() => void updateStatus(order, counterTransitions[order.status][0])} disabled={isBusy(order.id) || actionsUnavailable()} title={actionsUnavailable() ? 'Refresh orders before taking another action.' : undefined} aria-label={`${nextAction(order.status)} order #${order.display_number}`}>{isBusy(order.id) ? 'Updating…' : nextAction(order.status)}</button>{/if}
					{#if active(order)}<Dialog.Trigger class="cancel-order" type="button" onpointerdown={() => beginCancellation(order)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') beginCancellation(order); }} disabled={isBusy(order.id) || actionsUnavailable()} title={actionsUnavailable() ? 'Refresh orders before taking another action.' : undefined} aria-label={`Cancel order #${order.display_number}`}>Cancel</Dialog.Trigger>{/if}
				</div>
			</footer>
		</article>
	{/snippet}

	{#if loading && !orders.length}
		<section class="counter-state" aria-busy="true"><p class="eyebrow">Loading board</p><h2>Finding the latest orders…</h2></section>
	{:else if boardView === 'lanes' && statusOrder.some((status) => selectedStatuses[status])}
		<section class="order-lanes" aria-label="Orders by status" data-testid="counter-lanes">
			{#each statusOrder.filter((status) => selectedStatuses[status]) as status}
				{@const lane = laneOrders(status)}
				<section class="order-lane" aria-labelledby={`counter-lane-${status}`} data-testid={`counter-lane-${status}`}>
					<header class="order-lane-header"><h2 id={`counter-lane-${status}`}>{statusLabels[status]}</h2><span>{lane.length} {lane.length === 1 ? 'order' : 'orders'}</span></header>
					{#if lane.length}
						<div class="order-lane-tickets">{#each lane as order (order.id)}{@render orderTicket(order)}{/each}</div>
					{:else}
						<p class="order-lane-empty">No {statusLabels[status].toLocaleLowerCase()} orders match the current filters.</p>
					{/if}
				</section>
			{/each}
		</section>
	{:else if !visibleOrders().length}
		<section class="counter-state">
			<p class="eyebrow">{query.trim() ? 'No matching orders' : 'No selected orders'}</p>
			<h2>{query.trim() ? 'No orders match that search.' : 'Nothing matches the selected statuses.'}</h2>
			<p>{query.trim() ? 'Try an order number, table, item, option, or note.' : 'Choose another status above to reveal its tickets.'}</p>
		</section>
	{:else}
		<section class="order-board" aria-label="Orders">
			{#each visibleOrders() as order (order.id)}{@render orderTicket(order)}{/each}
		</section>
	{/if}
</main>
	<Dialog.Content class="counter-cancel-dialog" showCloseButton={false} aria-describedby="counter-cancel-description" data-testid="counter-cancel-dialog">
	{#if cancelTarget}
		<Dialog.Header>
			<p class="eyebrow">Cancel order</p>
			<Dialog.Title>Cancel order #{cancelTarget.display_number}?</Dialog.Title>
			<Dialog.Description id="counter-cancel-description">This will cancel the order for {cancelTarget.label}. It cannot be returned to the active queue from this board.</Dialog.Description>
		</Dialog.Header>
		{#if cancelDialogError}<p class="counter-cancel-error" role="alert">{cancelDialogError}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={dismissCancellation} disabled={cancelSubmitting}>Keep order</Button>
			<Button variant="destructive" onclick={() => void confirmCancellation()} disabled={cancelSubmitting} aria-busy={cancelSubmitting} data-testid="counter-confirm-cancel">{cancelSubmitting ? 'Cancelling…' : 'Cancel order'}</Button>
		</Dialog.Footer>
	{/if}
	</Dialog.Content>
</Dialog.Root>
