<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import {
		ArrowRight,
		Banknote,
		ChefHat,
		Clock3,
		CircleCheck,
		ListChecks,
		QrCode,
		Sparkles,
		UtensilsCrossed,
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const queueLabels = [
		{ key: 'newOrders', label: 'New', tone: 'brand' },
		{ key: 'acceptedOrders', label: 'Accepted', tone: 'info' },
		{ key: 'preparingOrders', label: 'Preparing', tone: 'warning' },
		{ key: 'readyOrders', label: 'Ready', tone: 'success' },
	] as const;
</script>

<svelte:head><title>Overview — Menyue admin</title></svelte:head>

<div class="admin-dashboard space-y-6 sm:space-y-8">
	<header class="dashboard-intro">
		<p class="dashboard-kicker">Operations overview</p>
		<h1>Welcome, {data.user!.username}</h1>
		<p>
			{#if data.isAdmin}
				A tenant-scoped snapshot of the menu, service, and sales today (UTC).
			{:else}
				Your menu workspace at a glance. Service, sales, and table controls are reserved for administrators.
			{/if}
		</p>
	</header>

	<section aria-labelledby="menu-overview-title">
		<div class="dashboard-section-heading">
			<div>
				<p class="dashboard-kicker">Menu</p>
				<h2 id="menu-overview-title">Menu at a glance</h2>
			</div>
			<a class="dashboard-inline-link" href="/admin/menu/items">Manage menu <ArrowRight size={16} /></a>
		</div>
		<div class="dashboard-metrics-grid" aria-label="Menu metrics">
			<a class="dashboard-card-link" href="/admin/menu/categories" aria-label={`${data.metrics.categoryCount} categories. Manage categories.`}>
				<Card class="dashboard-metric dashboard-metric--brand" size="sm">
					<CardContent class="dashboard-metric-content">
						<ListChecks class="dashboard-metric-icon" size={21} aria-hidden="true" />
						<span class="dashboard-metric-value">{data.metrics.categoryCount}</span>
						<span class="dashboard-metric-label">Categories</span>
					</CardContent>
				</Card>
			</a>
			<a class="dashboard-card-link" href="/admin/menu/items" aria-label={`${data.metrics.itemCount} menu items. Manage items.`}>
				<Card class="dashboard-metric dashboard-metric--info" size="sm">
					<CardContent class="dashboard-metric-content">
						<UtensilsCrossed class="dashboard-metric-icon" size={21} aria-hidden="true" />
						<span class="dashboard-metric-value">{data.metrics.itemCount}</span>
						<span class="dashboard-metric-label">Menu items</span>
					</CardContent>
				</Card>
			</a>
			<a class="dashboard-card-link" href="/admin/menu/items" aria-label={`${data.metrics.unavailableItemCount} sold-out menu items. Manage items.`}>
				<Card class="dashboard-metric dashboard-metric--warning" size="sm">
					<CardContent class="dashboard-metric-content">
						<UtensilsCrossed class="dashboard-metric-icon" size={21} aria-hidden="true" />
						<span class="dashboard-metric-value">{data.metrics.unavailableItemCount}</span>
						<span class="dashboard-metric-label">Sold out</span>
					</CardContent>
				</Card>
			</a>
			<a class="dashboard-card-link" href="/admin/menu/items" aria-label={`${data.metrics.optionCount} enabled option choices. Manage menu items.`}>
				<Card class="dashboard-metric dashboard-metric--warning" size="sm">
					<CardContent class="dashboard-metric-content">
						<ChefHat class="dashboard-metric-icon" size={21} aria-hidden="true" />
						<span class="dashboard-metric-value">{data.metrics.optionCount}</span>
						<span class="dashboard-metric-label">Option choices</span>
					</CardContent>
				</Card>
			</a>
			<a class="dashboard-card-link" href="/admin/menu/items" aria-label={`${data.metrics.suggestionCount} active suggestion links. Manage menu items.`}>
				<Card class="dashboard-metric dashboard-metric--success" size="sm">
					<CardContent class="dashboard-metric-content">
						<Sparkles class="dashboard-metric-icon" size={21} aria-hidden="true" />
						<span class="dashboard-metric-value">{data.metrics.suggestionCount}</span>
						<span class="dashboard-metric-label">Suggestion links</span>
					</CardContent>
				</Card>
			</a>
		</div>
		{#if data.metrics.itemCount === 0}
			<p class="dashboard-empty" role="status">Your menu is empty. Add a category, then create your first item.</p>
		{/if}
	</section>

	{#if data.isAdmin}
		<section class="dashboard-primary-grid" aria-label="Service and sales">
			<Card class="dashboard-panel dashboard-panel--service">
				<CardHeader class="dashboard-panel-header">
					<div>
						<p class="dashboard-kicker">Service now</p>
						<CardTitle>Open order queue</CardTitle>
					</div>
					<Clock3 class="dashboard-panel-icon" size={24} aria-hidden="true" />
				</CardHeader>
				<CardContent class="space-y-4">
					{@const openOrders = data.metrics.newOrders + data.metrics.acceptedOrders + data.metrics.preparingOrders + data.metrics.readyOrders}
					<div class="dashboard-big-number"><strong>{openOrders}</strong><span>open orders</span></div>
					<div class="dashboard-status-grid" aria-label="Open orders by status">
						{#each queueLabels as queue}
							<div class={`dashboard-status dashboard-status--${queue.tone}`}>
								<span>{queue.label}</span><strong>{data.metrics[queue.key]}</strong>
							</div>
						{/each}
					</div>
					{#if openOrders === 0}
						<p class="dashboard-empty">No orders are waiting in the counter queue.</p>
					{/if}
					<a class="dashboard-action" href="/counter">Open counter <ArrowRight size={16} /></a>
				</CardContent>
			</Card>

			<Card class="dashboard-panel dashboard-panel--revenue">
				<CardHeader class="dashboard-panel-header">
					<div>
						<p class="dashboard-kicker">Today (UTC)</p>
						<CardTitle>Sales &amp; revenue</CardTitle>
					</div>
					<Banknote class="dashboard-panel-icon" size={24} aria-hidden="true" />
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="dashboard-money-grid">
						<div><span>Placed sales</span><strong>{data.metrics.salesToday}</strong><small>Excludes cancelled orders</small></div>
						<div><span>Completed revenue</span><strong>{data.metrics.revenueToday}</strong><small>Completed orders only</small></div>
					</div>
					<div class="dashboard-order-summary">
						<span>{data.metrics.ordersToday} placed</span>
						<span>{data.metrics.completedToday} completed</span>
						<span>{data.metrics.cancelledToday} cancelled</span>
					</div>
					{#if data.metrics.ordersToday === 0}
						<p class="dashboard-empty">No orders have been placed today yet.</p>
					{/if}
				</CardContent>
			</Card>
		</section>

		<section aria-labelledby="operations-title">
			<div class="dashboard-section-heading">
				<div><p class="dashboard-kicker">Configuration</p><h2 id="operations-title">Keep service moving</h2></div>
			</div>
			<div class="dashboard-operations-grid">
				<a class="dashboard-card-link" href="/admin/tables" aria-label={`${data.metrics.tableCount} tables, ${data.metrics.enabledTableCount} enabled. Manage tables and QR tokens.`}>
					<Card class="dashboard-operation-card">
						<CardContent class="dashboard-operation-content">
							<QrCode class="dashboard-operation-icon" size={23} aria-hidden="true" />
							<div><h3>Tables &amp; QR tokens</h3><p>{data.metrics.enabledTableCount} live of {data.metrics.tableCount} tables</p></div><ArrowRight size={18} aria-hidden="true" />
						</CardContent>
					</Card>
				</a>
				<a class="dashboard-card-link" href="/admin/settings" aria-label={`${data.metrics.beveragePromptCount} active beverage prompt and ${data.metrics.beverageTargetCount} targets. Manage settings.`}>
					<Card class="dashboard-operation-card">
						<CardContent class="dashboard-operation-content">
							<CircleCheck class="dashboard-operation-icon" size={23} aria-hidden="true" />
							<div><h3>Final drinks prompt</h3><p>{data.metrics.beveragePromptCount ? `${data.metrics.beverageTargetCount} menu targets configured` : 'No active upsell prompt'}</p></div><ArrowRight size={18} aria-hidden="true" />
						</CardContent>
					</Card>
				</a>
			</div>
		</section>
	{/if}
</div>
