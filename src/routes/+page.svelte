<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import BrandMark from '$lib/components/ui/BrandMark.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.restaurantName}</title></svelte:head>

<div class="min-h-dvh bg-gradient-to-br from-lagoon-800 via-lagoon-700 to-ink-900 text-sand-50">
	<div class="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pb-8 pt-[calc(var(--safe-top)+2.5rem)]">
		<header class="flex items-center gap-2">
			<BrandMark logoKey={data.brand.logoKey} size={36} tone="light" />
			<span class="font-display text-xl font-bold">{data.brand.name}</span>
		</header>

		<div class="flex flex-1 flex-col justify-center py-10">
			<p class="mb-2 text-sm font-semibold uppercase tracking-wide text-lagoon-200">Welcome</p>
			<h1 class="max-w-2xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
				Scan the code at your table to explore our menu.
			</h1>
			<p class="mt-4 max-w-xl text-lg text-sand-200/90">
				Browse our full photographic menu, customise every dish to your taste, switch to your
				home currency, and send your order straight to the kitchen — all from your phone.
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				{#if data.demoToken}
					<a href="/t/{data.demoToken}" class="inline-flex items-center gap-2 rounded-full bg-sand-50 px-6 py-3.5 font-semibold text-lagoon-800 transition-transform hover:scale-[1.02]">
						<Icon name="sparkle" size={18} /> Preview the menu
					</a>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			{#each [{ i: 'search', t: 'Browse & search', d: 'Over 100 dishes and drinks with photos, allergens and dietary labels.' }, { i: 'sparkle', t: 'Make it yours', d: 'Choose options, add sides, and note anything special for the kitchen.' }, { i: 'coins', t: 'Your currency', d: 'See prices in your home currency — you’re always charged in the local rate.' }] as f}
				<div class="rounded-2xl bg-white/8 p-4 backdrop-blur">
					<span class="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-sand-50/15"><Icon name={f.i} size={18} /></span>
					<div class="font-display text-base font-bold">{f.t}</div>
					<div class="mt-1 text-sm text-sand-200/85">{f.d}</div>
				</div>
			{/each}
		</div>

		<p class="mt-6 text-center text-xs text-sand-300/70">Please order from the menu link on your table.</p>
	</div>
</div>
