<script lang="ts">
	import {
		customerMoney,
		type ClientBaseCurrency,
		type ClientDisplayCurrency,
	} from '$lib/currency';
	import { createCustomerMenuSearchIndex } from '$lib/customer-menu';
	import CurrencySelector from '$lib/components/customer/currency-selector.svelte';
	import MenuItemImage from '$lib/components/customer/menu-item-image.svelte';
	import MenuItemMetadata from '$lib/components/customer/menu-item-metadata.svelte';
	import MenuTools from '$lib/components/customer/menu-tools.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let selected = $state(''),
		search = $state('');
	const base = $derived({
		code: data.menu.currency,
		minorUnit: data.menu.currencyMinorUnit,
		locale: data.menu.currencyLocale,
	} as ClientBaseCurrency);
	const quotes = $derived((data.menu.displayCurrencies ?? []) as ClientDisplayCurrency[]);
	const quote = $derived(quotes.find((entry) => entry.code === selected));
	const money = (minor: number) => customerMoney(minor, base, quote);
	const searchIndex = createCustomerMenuSearchIndex(data.menu.categories);
	const searchResults = $derived(searchIndex.search(search));
	const cta = $derived(
		data.menu.hero.ctaUrl?.startsWith('/') || data.menu.hero.ctaUrl?.startsWith('#')
			? data.menu.hero.ctaUrl
			: '#menu',
	);
</script>

<svelte:head
	><title>{data.menu.hero.title} — Menyue</title><meta
		name="description"
		content={data.menu.hero.description ?? 'Menyue dining'}
	/></svelte:head
>
<main
	class="public-shell customer-brand"
	style:--customer-primary={data.menu.brand.primary}
	style:--customer-primary-foreground={data.menu.brand.primaryForeground}
	style:--customer-accent={data.menu.brand.accent}
	style:--customer-accent-foreground={data.menu.brand.accentForeground}
>
	<header class="public-nav">
		<a class="wordmark customer-wordmark" href="/"
			>{#if data.menu.brand.logoAssetId}<img
					src={`/media/${data.menu.brand.logoAssetId}`}
					alt={`${data.menu.hero.title} logo`}
				/>{/if}<span>{data.menu.hero.title}</span></a
		>
		<nav aria-label="Main navigation">
			<a href="#menu">The menu</a><a href="#about">Our table</a>
		</nav>
		<CurrencySelector {base} {quotes} bind:value={selected} />
	</header>
	<section class="hero-grid" id="about">
		<div class="hero-copy">
			<p class="eyebrow">Restaurant menu</p>
			<h1>{data.menu.hero.title}</h1>
			<p class="lede">
				{data.menu.hero.description ??
					'A bright, generous table for long lunches and late evenings.'}
			</p>
			<a class="editorial-link" href={cta}
				>{data.menu.hero.ctaLabel ?? 'Explore the menu'} <span>↘</span></a
			>
		</div>
		<div class="hero-art">
			{#if data.menu.hero.photoId}<img
					src={`/media/${data.menu.hero.photoId}`}
					alt="A table at Menyue"
				/>{:else}<div class="sun-disc"></div>
				<p>Gather slowly.<br />Eat beautifully.</p>{/if}
		</div>
	</section>
	<section id="menu" class="menu-section">
		<div class="menu-heading compact">
			<p class="eyebrow">Today’s selection</p>
			<h2>Browse the menu.</h2>
		</div>
		<MenuTools
			categories={searchResults.groups.map((group) => group.category)}
			resultCount={searchResults.resultCount}
			searchActive={Boolean(searchResults.query)}
			bind:search
		>
			{#snippet controls()}<CurrencySelector
					{base}
					{quotes}
					bind:value={selected}
					testId="currency-selector-sticky"
				/>{/snippet}
			{#each searchResults.groups as group, categoryIndex}{@const { category, items } = group}
				<section id={category.id} class="menu-category">
					<div class="category-index">0{categoryIndex + 1}</div>
					<div>
						<h3>{category.name}</h3>
						{#if category.description}<p class="category-note">{category.description}</p>{/if}
					</div>
					<div class="dish-list">
						{#each items as item}<article class="dish-card" data-testid={`dish-${item.id}`}>
								<div class="dish-image"><MenuItemImage {item} /></div>
								<div class="dish-body">
									<div class="dish-title">
										<h4>{item.name}</h4>
										<strong>{money(item.promotion?.priceMinor ?? item.priceMinor)}</strong>
									</div>
									{#if item.description}<p>{item.description}</p>{/if}<MenuItemMetadata {item} />
								</div>
							</article>{/each}
					</div>
				</section>{/each}
		</MenuTools>
	</section>
	<footer class="public-footer">
		<span>MENYUE</span>
		<p>Come hungry. Leave happy.</p>
		<a href="#top">Back to top ↑</a>
	</footer>
</main>

<style>
	.public-shell {
		overflow-x: clip;
		overflow-y: visible;
	}
	.public-shell :is(a, button):focus-visible {
		outline: 3px solid var(--customer-focus);
		outline-offset: 3px;
	}
	.menu-category {
		scroll-margin-top: 1.25rem;
	}
	@media (max-width: 760px) {
		.menu-category {
			scroll-margin-top: 9rem;
		}
	}
	@media (min-width: 761px) and (max-width: 900px) {
		.menu-category {
			grid-template-columns: 42px minmax(0, 1fr);
		}
		.dish-list {
			grid-column: 1 / -1;
		}
	}
</style>
