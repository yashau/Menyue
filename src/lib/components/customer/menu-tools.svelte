<script lang="ts">
	type Category = { id: string; name: string };
	type Props = {
		categories: Category[];
		search?: string;
		searchLabel?: string;
		resultCount?: number;
		searchActive?: boolean;
		controls?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
	};
	let {
		categories,
		search = $bindable(''),
		searchLabel = 'Search menu',
		resultCount = 0,
		searchActive = false,
		controls,
		children,
	}: Props = $props();
	let activeCategory = $state<string | undefined>();
	let categoryObserver: IntersectionObserver | undefined;
	const isCurrent = (category: Category) =>
		activeCategory === category.id || (!activeCategory && category.id === categories[0]?.id);

	$effect(() => {
		const observedSearch = search;
		const frame = requestAnimationFrame(() => {
			if (observedSearch !== search) return;
			categoryObserver?.disconnect();
			const sections = categories
				.map((category) => document.getElementById(category.id))
				.filter((section): section is HTMLElement => section !== null);
			if (!sections.length) return;
			activeCategory = sections[0].id;
			categoryObserver = new IntersectionObserver(
				(entries) => {
					const current = entries
						.filter((entry) => entry.isIntersecting)
						.sort(
							(left, right) =>
								Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top),
						)[0];
					if (current) activeCategory = current.target.id;
				},
				{ rootMargin: '-18% 0px -66% 0px', threshold: 0 },
			);
			sections.forEach((section) => categoryObserver?.observe(section));
		});
		return () => {
			cancelAnimationFrame(frame);
			categoryObserver?.disconnect();
		};
	});
</script>

<div class="customer-menu-layout" data-testid="customer-menu-tools">
	<aside class="customer-menu-sidebar">
		<div class="customer-menu-controls">
			<div class="customer-menu-search" role="search">
				<label>
					<span class="sr-only">{searchLabel}</span>
					<input
						bind:value={search}
						aria-label={searchLabel}
						placeholder="Search dishes, drinks, allergies…"
					/>
				</label>
				<button type="button" aria-label="Clear search" onclick={() => (search = '')}>×</button>
			</div>
			{#if controls}<div class="customer-menu-mobile-controls">{@render controls()}</div>{/if}
		</div>
		<nav class="customer-category-rail" aria-label="Menu categories">
			{#each categories as category}
				<a
					href={`#${category.id}`}
					class:current={isCurrent(category)}
					aria-current={isCurrent(category) ? 'location' : undefined}
					onclick={() => (activeCategory = category.id)}>{category.name}</a
				>
			{/each}
		</nav>
	</aside>
	<div class="customer-menu-content">
		{#if searchActive}
			<div
				class="customer-menu-search-summary"
				data-testid="menu-search-result-count"
				aria-live="polite"
			>
				<p>{resultCount} {resultCount === 1 ? 'result' : 'results'} for “{search.trim()}”</p>
				<button type="button" aria-label="Clear menu search" onclick={() => (search = '')}
					>Clear</button
				>
			</div>
		{/if}
		{#if searchActive && resultCount === 0}
			<div class="empty-menu" data-testid="menu-search-empty">
				<h2>No dishes found</h2>
				<p>Try a dish, category, allergy or dietary term.</p>
				<button type="button" onclick={() => (search = '')}>Show all dishes</button>
			</div>
		{:else}
			{@render children?.()}
		{/if}
	</div>
</div>

<style>
	.customer-menu-layout {
		display: grid;
		grid-template-columns: minmax(10.5rem, 14rem) minmax(0, 1fr);
		gap: clamp(1rem, 3vw, 2.5rem);
		align-items: start;
		min-width: 0;
	}
	.customer-menu-sidebar {
		position: sticky;
		top: 1rem;
		display: grid;
		align-self: start;
		gap: 0.75rem;
		max-block-size: calc(100dvh - 2rem);
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.65rem;
		background: var(--customer-paper);
	}
	.customer-menu-content {
		min-width: 0;
	}
	.customer-menu-search-summary {
		display: flex;
		min-height: 44px;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 0 1rem;
		border-bottom: 1px solid var(--customer-border);
		color: var(--customer-ink);
		font-size: 0.86rem;
	}
	.customer-menu-search-summary p {
		margin: 0;
	}
	.customer-menu-search-summary button,
	.empty-menu button {
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--customer-primary);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.customer-menu-search-summary button:focus-visible,
	.empty-menu button:focus-visible {
		outline: 3px solid var(--customer-focus);
		outline-offset: 2px;
	}
	.empty-menu {
		display: grid;
		justify-items: start;
		gap: 0.5rem;
		padding: 2rem 0;
		color: var(--customer-ink);
	}
	.empty-menu h2,
	.empty-menu p {
		margin: 0;
	}
	.customer-menu-controls {
		display: contents;
	}
	.customer-menu-mobile-controls {
		display: none;
	}
	.customer-menu-search {
		display: flex;
		flex: 1;
		min-height: 44px;
		align-items: center;
		border: 1px solid var(--customer-border);
		background: var(--customer-surface);
	}
	.customer-menu-search label {
		display: flex;
		flex: 1;
	}
	.customer-menu-search input {
		min-width: 0;
		width: 100%;
		border: 0;
		background: transparent;
		padding: 0.72rem 0.75rem;
		color: var(--customer-ink);
		font: inherit;
		font-size: 0.86rem;
	}
	.customer-menu-search input:focus-visible {
		outline: 3px solid var(--customer-focus);
		outline-offset: -3px;
	}
	.customer-menu-search button {
		min-width: 44px;
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--customer-ink);
		font-size: 1.2rem;
		cursor: pointer;
	}
	.customer-menu-search button:focus-visible,
	.customer-category-rail a:focus-visible {
		outline: 3px solid var(--customer-focus);
		outline-offset: 2px;
	}
	.customer-category-rail {
		display: grid;
		gap: 0.35rem;
		padding: 0;
	}
	.customer-category-rail a {
		display: block;
		min-height: 44px;
		border: 1px solid var(--customer-border);
		border-radius: 0.35rem;
		padding: 0.65rem 0.85rem;
		color: var(--customer-ink);
		font-size: 0.78rem;
		text-decoration: none;
	}
	.customer-category-rail a:hover {
		background: color-mix(in oklch, var(--customer-surface) 82%, var(--customer-primary));
	}
	.customer-category-rail a.current {
		border-color: var(--customer-primary);
		background: var(--customer-primary);
		color: var(--customer-primary-foreground);
		font-weight: 750;
	}
	@media (max-width: 760px) {
		.customer-menu-layout {
			display: block;
		}
		.customer-menu-sidebar {
			position: sticky;
			z-index: 5;
			top: 0;
			gap: 0.55rem;
			max-block-size: none;
			margin: 0 0 1.4rem;
			padding: max(0.55rem, env(safe-area-inset-top)) 0 0.55rem;
			box-shadow: 0 0.35rem 0.8rem color-mix(in oklch, var(--customer-ink) 14%, transparent);
		}
		.customer-menu-controls {
			display: flex;
			min-width: 0;
			align-items: stretch;
			gap: 0.45rem;
		}
		.customer-menu-search {
			min-width: 0;
		}
		.customer-menu-mobile-controls {
			display: flex;
			flex: none;
		}
		.customer-category-rail {
			display: flex;
			width: 100%;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.customer-category-rail a {
			flex: none;
			border-radius: 99px;
		}
	}
	@media (max-width: 420px) {
		.customer-menu-controls {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
		.customer-menu-search,
		.customer-menu-mobile-controls {
			width: 100%;
		}
	}
</style>
