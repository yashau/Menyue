<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, data }: { children: Snippet; data: { user: { role: string } } } = $props();
</script>

<div class="min-h-screen bg-stone-100">
	<nav class="flex gap-4 bg-stone-950 p-4 text-white">
		<a href="/admin">CMS</a><a href="/admin/menu/categories">Categories</a><a
			href="/admin/menu/items">Items</a
		><a href="/admin/hero">Hero</a>{#if data.user.role === 'admin'}<a href="/admin/tables">Tables</a
			><a href="/admin/users">Users</a>{/if}
	</nav>
	<main class="mx-auto max-w-6xl p-6">{@render children()}</main>
</div>
