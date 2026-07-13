<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import {
		LayoutTemplate,
		LogOut,
		Menu as MenuIcon,
		Settings,
		TableProperties,
		Users,
		MonitorCog,
		UtensilsCrossed,
	} from 'lucide-svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';

	let {
		children,
		data,
	}: { children: Snippet; data: { user?: { username: string; role: string } } } = $props();

	const links = [
		{ href: '/admin', label: 'Overview', icon: LayoutTemplate },
		{ href: '/admin/menu/categories', label: 'Categories', icon: MenuIcon },
		{ href: '/admin/menu/items', label: 'Menu items', icon: UtensilsCrossed },
		{ href: '/admin/hero', label: 'Editorial', icon: Settings },
	];
	const adminLinks = [
		{ href: '/admin/tables', label: 'Tables', icon: TableProperties },
		{ href: '/admin/users', label: 'People', icon: Users },
		{ href: '/admin/counter-operators', label: 'Counter access', icon: MonitorCog },
		{ href: '/admin/settings', label: 'Settings', icon: Settings },
	];

	function isActive(href: string) {
		return href === '/admin' ? page.url.pathname === href : page.url.pathname.startsWith(href);
	}
</script>

{#snippet menuLink(link: (typeof links)[number])}
	{@const Icon = link.icon}
	<Sidebar.MenuItem>
		<Sidebar.MenuButton isActive={isActive(link.href)} tooltipContent={link.label}>
			{#snippet child({ props })}
				<a href={link.href} {...props}><Icon /><span>{link.label}</span></a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

{#if data.user}
	<div class="admin-shell">
		<Sidebar.Provider>
			<a
				href="#admin-main"
				class="sr-only fixed top-4 left-4 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-border focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>Skip to main content</a
			>
			<Sidebar.Root collapsible="icon">
				<Sidebar.Header>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton size="lg" tooltipContent="Menyue admin">
								{#snippet child({ props })}<a href="/admin" {...props}
										><UtensilsCrossed /><span class="font-semibold">Menyue admin</span></a
									>{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.Header>
				<nav aria-label="Admin navigation">
					<Sidebar.Content>
						<Sidebar.Group>
							<Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
							<Sidebar.GroupContent
								><Sidebar.Menu
									>{#each links as link}{@render menuLink(link)}{/each}</Sidebar.Menu
								></Sidebar.GroupContent
							>
						</Sidebar.Group>
						{#if data.user.role === 'admin'}
							<Sidebar.Group>
								<Sidebar.GroupLabel>Administration</Sidebar.GroupLabel>
								<Sidebar.GroupContent
									><Sidebar.Menu
										>{#each adminLinks as link}{@render menuLink(link)}{/each}</Sidebar.Menu
									></Sidebar.GroupContent
								>
							</Sidebar.Group>
						{/if}
					</Sidebar.Content>
				</nav>
				<Sidebar.Footer>
					<Sidebar.Menu>
						<Sidebar.MenuItem
							><form method="POST" action="/admin/logout">
								<button
									class="flex h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
									type="submit"><LogOut class="size-4" /><span>Sign out</span></button
								>
							</form></Sidebar.MenuItem
						>
					</Sidebar.Menu>
					<div class="px-3 pb-2 group-data-[collapsible=icon]:hidden">
						<p class="truncate text-sm font-medium">{data.user.username}</p>
						<p class="truncate text-xs text-muted-foreground capitalize">{data.user.role}</p>
					</div>
				</Sidebar.Footer>
				<Sidebar.Rail />
			</Sidebar.Root>
			<Sidebar.Inset id="admin-main" tabindex={-1}>
				<header
					aria-label="Admin header"
					class="admin-header flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4"
				>
					<Sidebar.Trigger /><span class="text-sm font-medium md:hidden">Menyue admin</span>
				</header>
				<div class="admin-content min-w-0 flex-1 p-3 sm:p-4 md:p-6 lg:p-8">
					{@render children()}
				</div>
			</Sidebar.Inset>
		</Sidebar.Provider>
	</div>
{:else}
	<div class="admin-shell admin-login-shell">{@render children()}</div>
{/if}
