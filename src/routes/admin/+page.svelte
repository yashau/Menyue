<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import QrCode from '@lucide/svelte/icons/qr-code';

	let { data } = $props();

	const cards = $derived([
		{ label: 'Live menu items', value: data.stats.live, sub: `${data.stats.items} total`, href: '/admin/menu' },
		{ label: 'Marked unavailable', value: data.stats.unavailable, sub: 'temporarily off', href: '/admin/menu' },
		{ label: 'Categories', value: data.stats.cats, sub: 'menu sections', href: '/admin/menu' },
		{ label: 'Active tables', value: data.stats.activeTables, sub: `${data.stats.tables} total`, href: '/admin/tables' },
		{ label: 'Display currencies', value: data.stats.currencies, sub: 'enabled', href: '/admin/settings' },
		{ label: 'Active orders', value: data.stats.ordersActive, sub: `${data.stats.ordersTotal} all-time`, href: '/counter' }
	]);
</script>

<svelte:head><title>Dashboard · Menyue admin</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<header class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Welcome back, {data.user.displayName.split(' ')[0]}</h1>
		<p class="text-sm text-muted-foreground">Here's the state of your menu and service today.</p>
	</header>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
		{#each cards as c (c.href + c.label)}
			<a href={c.href} class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Card.Root class="h-full gap-0 transition-colors hover:bg-muted/50">
					<Card.Content class="px-4">
						<div class="text-3xl font-semibold tabular-nums">{c.value}</div>
						<div class="mt-1 text-sm font-medium">{c.label}</div>
						<div class="text-xs text-muted-foreground">{c.sub}</div>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>

	<div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
		<a href="/admin/menu" class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<Card.Root class="h-full bg-primary text-primary-foreground transition-opacity hover:opacity-95">
				<Card.Content class="flex items-center justify-between gap-3 px-5">
					<div class="flex items-center gap-3">
						<UtensilsCrossed class="size-6 shrink-0 opacity-90" />
						<div>
							<div class="text-base font-semibold">Manage the menu</div>
							<div class="text-sm opacity-80">Edit items, availability, options &amp; suggestions</div>
						</div>
					</div>
					<ArrowRight class="size-5 shrink-0" />
				</Card.Content>
			</Card.Root>
		</a>
		<a href="/admin/tables" class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<Card.Root class="h-full transition-colors hover:bg-muted/50">
				<Card.Content class="flex items-center justify-between gap-3 px-5">
					<div class="flex items-center gap-3">
						<QrCode class="size-6 shrink-0 text-muted-foreground" />
						<div>
							<div class="text-base font-semibold">Table links</div>
							<div class="text-sm text-muted-foreground">Share QR / ordering URLs with your floor</div>
						</div>
					</div>
					<ArrowRight class="size-5 shrink-0 text-muted-foreground" />
				</Card.Content>
			</Card.Root>
		</a>
	</div>

	{#if !data.isAdmin}
		<Separator class="my-6" />
		<p class="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
			You're signed in as a <strong class="font-medium text-foreground">manager</strong>. Settings, currency
			configuration and user accounts are limited to administrators.
		</p>
	{/if}
</div>
