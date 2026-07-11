<script lang="ts">
	import type { MenuItem } from '$lib/types';
	import { getCurrency } from '$lib/currency.svelte';
	import { getCart } from '$lib/cart.svelte';
	import { itemImage } from '$lib/image';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		item: MenuItem;
		oncustomize: (item: MenuItem) => void;
		onquickadd: (item: MenuItem) => void;
	}
	let { item, oncustomize, onquickadd }: Props = $props();

	const currency = getCurrency();
	const cart = getCart();

	const orderable = $derived(item.enabled && item.availability === 'available');
	const hasOptions = $derived(item.optionGroups.length > 0);
	// The wizard opens when there are options OR suggestions. The label is
	// "Choose" only when there are real options to customise; otherwise "Add"
	// (which still pops the "goes well with" step).
	const needsWizard = $derived(hasOptions || item.suggestionIds.length > 0);
	const inCartQty = $derived(
		cart.lines.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.quantity, 0)
	);

	// The single mergeable cart line for a simple (no-options) item, so repeated
	// adds bump quantity instead of stacking lines and the card shows a stepper.
	const simpleLine = $derived(
		needsWizard
			? undefined
			: cart.lines.find(
					(l) => l.itemId === item.id && l.options.length === 0 && !l.notes && !l.isSuggested
				)
	);

	function addOne() {
		if (!orderable) return;
		if (needsWizard) {
			oncustomize(item);
			return;
		}
		if (simpleLine) cart.setQuantity(simpleLine.uid, simpleLine.quantity + 1);
		else onquickadd(item);
	}
	function decOne() {
		if (simpleLine) cart.setQuantity(simpleLine.uid, simpleLine.quantity - 1);
	}
</script>

<article
	class="group relative flex gap-3 rounded-2xl border border-ink-600/10 bg-sand-50 p-2.5 shadow-[0_1px_2px_rgba(20,32,28,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-600/15 hover:shadow-[0_10px_24px_-12px_rgba(20,32,28,0.28)] sm:p-3
		{orderable ? '' : 'opacity-95'}"
	data-testid="item-card"
	data-item-id={item.id}
	data-orderable={orderable}
>
	<div class="relative h-24 w-24 shrink-0 self-start overflow-hidden rounded-xl bg-sand-200 ring-1 ring-ink-900/5 sm:h-[104px] sm:w-[104px]">
		<img
			src={itemImage(item)}
			alt={item.name}
			loading="lazy"
			class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 {orderable ? '' : 'grayscale'}"
			width="112"
			height="112"
		/>
		{#if item.label}
			<span
				class="absolute left-0 top-2 rounded-r-full py-0.5 pl-2 pr-2.5 text-[10px] font-bold uppercase tracking-wide shadow-sm
					{item.labelKind === 'promo'
					? 'bg-coral-500 text-sand-50'
					: item.labelKind === 'new'
						? 'bg-lagoon-600 text-sand-50'
						: 'bg-ink-800/85 text-sand-50'}"
			>
				{item.label}
			</span>
		{/if}
		{#if inCartQty > 0}
			<span
				class="absolute bottom-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-lagoon-700 px-1.5 text-xs font-bold text-sand-50 shadow"
				aria-label="{inCartQty} in cart"
			>
				{inCartQty}×
			</span>
		{/if}
	</div>

	<div class="flex min-w-0 flex-1 flex-col">
		<h3 class="text-[15px] font-semibold leading-tight text-ink-800">
			{item.name}
		</h3>

		{#if item.description}
			<p class="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-400">{item.description}</p>
		{/if}

		{#if item.dietary.length || item.allergens.length}
			<div class="mt-1.5 flex flex-wrap items-center gap-1">
				{#each item.dietary.slice(0, 3) as d}
					<span class="inline-flex items-center rounded-full bg-lagoon-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-lagoon-700">
						{d}
					</span>
				{/each}
				{#if item.allergens.length}
					<span class="inline-flex items-center gap-0.5 text-[10px] font-medium text-ink-400">
						<Icon name="alert" size={11} /> {item.allergens.join(', ')}
					</span>
				{/if}
			</div>
		{/if}

		<div class="mt-auto flex items-center justify-between gap-2 pt-2.5">
			<div class="whitespace-nowrap font-display text-base font-bold text-ink-800">
				{currency.format(item.basePrice)}
				{#if currency.isConverted}
					<span class="ml-0.5 align-middle text-[10px] font-normal text-ink-400">est.</span>
				{/if}
			</div>

			{#if !orderable}
				<span class="inline-flex h-9 w-[112px] shrink-0 items-center justify-center rounded-full bg-ink-600/10 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
					Unavailable
				</span>
			{:else if needsWizard}
				<button
					type="button"
					onclick={() => oncustomize(item)}
					class="inline-flex h-9 w-[112px] shrink-0 items-center justify-center gap-1 rounded-full bg-lagoon-600 px-3.5 text-[13px] font-semibold text-sand-50 shadow-sm transition-colors hover:bg-lagoon-700 active:bg-lagoon-800"
					aria-label={hasOptions ? `Customize ${item.name}` : `Add ${item.name}`}
				>
					<Icon name={hasOptions ? 'sparkle' : 'plus'} size={15} />
					{hasOptions ? 'Choose' : 'Add'}
				</button>
			{:else if simpleLine}
				<div class="inline-flex h-9 w-[112px] shrink-0 items-center justify-between rounded-full bg-lagoon-600 text-sand-50 shadow-sm" role="group" aria-label="{item.name} quantity">
					<button type="button" onclick={decOne} class="flex h-9 w-10 items-center justify-center rounded-l-full hover:bg-lagoon-700" aria-label="Decrease {item.name}">
						<Icon name="minus" size={16} />
					</button>
					<span class="text-sm font-bold tabular-nums" data-testid="card-qty">{simpleLine.quantity}</span>
					<button type="button" onclick={addOne} class="flex h-9 w-10 items-center justify-center rounded-r-full hover:bg-lagoon-700" aria-label="Add another {item.name}">
						<Icon name="plus" size={16} />
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={addOne}
					class="inline-flex h-9 w-[112px] shrink-0 items-center justify-center gap-1 rounded-full bg-lagoon-600 px-3.5 text-[13px] font-semibold text-sand-50 shadow-sm transition-colors hover:bg-lagoon-700 active:bg-lagoon-800"
					aria-label="Add {item.name} to cart"
				>
					<Icon name="plus" size={15} /> Add
				</button>
			{/if}
		</div>
	</div>
</article>
