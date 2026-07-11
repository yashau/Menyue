<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/ui/Icon.svelte';
</script>

<svelte:head><title>{$page.status} · Menyue</title></svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-sand-100 p-6">
	<div class="w-full max-w-md rounded-2xl border border-ink-600/10 bg-sand-50 p-8 text-center shadow-sm">
		<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-coral-100 text-coral-600">
			<Icon name={$page.status === 404 ? 'search' : 'alert'} size={28} />
		</div>
		<h1 class="mt-4 font-display text-3xl font-bold text-ink-800">{$page.status}</h1>
		<p class="mt-2 text-sm text-ink-500">
			{$page.error?.message ?? 'Something went wrong.'}
		</p>
		<div class="mt-6 flex justify-center gap-2">
			<a href="/" class="rounded-full bg-lagoon-600 px-5 py-2.5 text-sm font-semibold text-sand-50 hover:bg-lagoon-700">Go home</a>
			{#if $page.status === 401 || $page.status === 403}
				<a href="/login" class="rounded-full border border-ink-600/20 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-100">Sign in</a>
			{/if}
		</div>
	</div>
</div>
