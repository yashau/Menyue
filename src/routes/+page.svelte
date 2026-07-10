<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const money = (n: number) =>
		new Intl.NumberFormat('en-MV', { style: 'currency', currency: data.menu.currency }).format(
			n / 100,
		);
	const cta = $derived(
		data.menu.hero.ctaUrl?.startsWith('/') || data.menu.hero.ctaUrl?.startsWith('#')
			? data.menu.hero.ctaUrl
			: '#menu',
	);
</script>

<main class="mx-auto max-w-5xl p-6">
	<section>
		{#if data.menu.hero.photoId}<img
				class="h-72 w-full rounded-xl object-cover"
				src={`/media/${data.menu.hero.photoId}`}
				alt="Restaurant"
			/>{/if}
		<h1 class="mt-6 text-5xl font-semibold">{data.menu.hero.title}</h1>
		{#if data.menu.hero.description}<p>{data.menu.hero.description}</p>{/if}<a href={cta}
			>{data.menu.hero.ctaLabel ?? 'View menu'}</a
		>
	</section>
	<section id="menu">
		{#each data.menu.categories as category}<h2 class="mt-10 text-2xl">{category.name}</h2>
			{#each category.items as item}<article class="mt-4 rounded bg-white p-4">
					<div class="flex justify-between">
						<strong>{item.name}</strong><span
							>{money(item.promotion?.priceMinor ?? item.priceMinor)}</span
						>
					</div>
					{#if item.photoId}<img
							class="mt-3 h-40 w-full object-cover"
							src={`/media/${item.photoId}`}
							alt={item.name}
						/>{/if}{#if item.description}<p>{item.description}</p>{/if}{#if item.promotion}<p>
							{item.promotion.label}{#if item.promotion.description}: {item.promotion
									.description}{/if}
						</p>{/if}{#if item.allergens?.length}<p>
							Allergens: {item.allergens.map((a) => a.name).join(', ')}
						</p>{/if}{#if item.comboGroups?.length}<p>
							{item.comboGroups
								.map((g) => `${g.name} (${g.minChoices}-${g.maxChoices})`)
								.join(' · ')}
						</p>{/if}
				</article>{/each}{/each}
	</section>
</main>
