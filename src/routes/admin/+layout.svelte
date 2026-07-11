<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Toaster } from '$lib/components/ui/sonner';
	import type { Component } from 'svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Users from '@lucide/svelte/icons/users';
	import Settings from '@lucide/svelte/icons/settings';
	import Menu from '@lucide/svelte/icons/menu';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Store from '@lucide/svelte/icons/store';

	let { data, children } = $props();
	let mobileNavOpen = $state(false);

	interface NavItem {
		href: string;
		label: string;
		icon: Component;
		adminOnly?: boolean;
	}
	const nav: NavItem[] = [
		{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
		{ href: '/admin/tables', label: 'Tables', icon: QrCode },
		{ href: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
		{ href: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true }
	];
	const visibleNav = $derived(nav.filter((n) => !n.adminOnly || data.isAdmin));

	const current = $derived($page.url.pathname);
	function isActive(href: string): boolean {
		return href === '/admin' ? current === '/admin' : current.startsWith(href);
	}
</script>

<svelte:head><title>Menyue admin</title></svelte:head>

<Toaster />

<div class="flex min-h-svh bg-background text-foreground" style="color-scheme: light dark">
	<!-- Desktop sidebar -->
	<aside
		class="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
	>
		<div class="flex items-center gap-2.5 px-5 py-4">
			{#if data.brand.logoKey}
				<img src={`/media/${data.brand.logoKey}`} alt="" class="size-9 shrink-0 rounded-md object-cover" />
			{:else}
				<span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<Store class="size-5" />
				</span>
			{/if}
			<div class="min-w-0">
				<div class="truncate text-sm font-semibold leading-tight text-sidebar-foreground">{data.brand.name}</div>
				<div class="text-xs text-muted-foreground">{data.isAdmin ? 'Administrator' : 'Manager'}</div>
			</div>
		</div>
		<Separator class="bg-sidebar-border" />
		<nav class="flex flex-1 flex-col gap-1 p-3">
			{#each visibleNav as item (item.href)}
				{@const Ico = item.icon}
				<Button
					href={item.href}
					variant={isActive(item.href) ? 'secondary' : 'ghost'}
					size="lg"
					class="w-full justify-start gap-2.5"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<Ico class="size-4" />
					{item.label}
				</Button>
			{/each}
		</nav>
		<Separator class="bg-sidebar-border" />
		<div class="p-3">
			<div class="mb-2 px-2">
				<div class="truncate text-sm font-medium text-sidebar-foreground">{data.user.displayName}</div>
				<div class="text-xs text-muted-foreground">@{data.user.username}</div>
			</div>
			<form method="POST" action="/logout">
				<Button type="submit" variant="outline" size="lg" class="w-full justify-start gap-2.5">
					<LogOut class="size-4" /> Sign out
				</Button>
			</form>
		</div>
	</aside>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Mobile top bar -->
		<header
			class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 pt-safe-header backdrop-blur lg:hidden"
		>
			<div class="flex items-center gap-2">
				{#if data.brand.logoKey}
					<img src={`/media/${data.brand.logoKey}`} alt="" class="size-8 shrink-0 rounded-md object-cover" />
				{:else}
					<span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<Store class="size-4" />
					</span>
				{/if}
				<span class="truncate text-sm font-semibold">{data.brand.name}</span>
			</div>
			<Button variant="outline" size="icon" onclick={() => (mobileNavOpen = true)} aria-label="Open navigation">
				<Menu />
			</Button>
		</header>

		<main class="min-w-0 flex-1">
			{@render children()}
		</main>
	</div>
</div>

<!-- Mobile nav sheet -->
<Sheet.Root bind:open={mobileNavOpen}>
	<Sheet.Content side="left" class="w-72 bg-sidebar p-0 text-sidebar-foreground">
		<Sheet.Header class="p-4">
			<Sheet.Title>{data.brand.name}</Sheet.Title>
		</Sheet.Header>
		<Separator class="bg-sidebar-border" />
		<nav class="flex flex-col gap-1 p-3">
			{#each visibleNav as item (item.href)}
				{@const Ico = item.icon}
				<Button
					href={item.href}
					variant={isActive(item.href) ? 'secondary' : 'ghost'}
					size="lg"
					class="w-full justify-start gap-2.5"
					onclick={() => (mobileNavOpen = false)}
				>
					<Ico class="size-4" />
					{item.label}
				</Button>
			{/each}
		</nav>
		<Separator class="bg-sidebar-border" />
		<form method="POST" action="/logout" class="p-3">
			<Button type="submit" variant="outline" size="lg" class="w-full justify-start gap-2.5">
				<LogOut class="size-4" /> Sign out
			</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
