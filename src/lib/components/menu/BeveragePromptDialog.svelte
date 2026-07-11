<script lang="ts">
	import type { MenuItem } from '$lib/types';
	import { getCart } from '$lib/cart.svelte';
	import { getCurrency } from '$lib/currency.svelte';
	import { itemImage } from '$lib/image';
	import { autoSelections, toCartOptions } from '$lib/wizard';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		open: boolean;
		heading: string;
		body: string;
		skipLabel: string;
		drinks: MenuItem[];
		showDrinks: boolean;
		showWater: boolean;
		waterItem: MenuItem | null;
		onsend: () => void;
		onclose: () => void;
	}
	let {
		open = $bindable(),
		heading,
		body,
		skipLabel,
		drinks,
		showDrinks,
		showWater,
		waterItem,
		onsend,
		onclose
	}: Props = $props();

	const cart = getCart();
	const currency = getCurrency();

	let qty = $state<Record<number, number>>({});
	let water = $state<{ Chilled: number; Unchilled: number }>({ Chilled: 0, Unchilled: 0 });

	const totalPicked = $derived(
		Object.values(qty).reduce((a, b) => a + b, 0) + water.Chilled + water.Unchilled
	);

	const promptHeading = $derived(showDrinks ? heading : 'A little water?');
	const promptBody = $derived(
		showDrinks ? body : 'Would you like some water with your meal? Just let us know how you like it.'
	);

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			qty = {};
			water = { Chilled: 0, Unchilled: 0 };
		}
		wasOpen = open;
	});

	function setQty(id: number, v: number) {
		qty = { ...qty, [id]: Math.max(0, Math.min(20, v)) };
	}
	function setWater(kind: 'Chilled' | 'Unchilled', v: number) {
		water = { ...water, [kind]: Math.max(0, Math.min(20, v)) };
	}

	function commitPicks() {
		if (showDrinks) {
			for (const d of drinks) {
				const q = qty[d.id] ?? 0;
				if (q > 0)
					cart.add({
						itemId: d.id,
						quantity: q,
						notes: '',
						options: toCartOptions(d, autoSelections(d)),
						isSuggested: false
					});
			}
		}
		if (showWater && waterItem) {
			for (const kind of ['Chilled', 'Unchilled'] as const) {
				const q = water[kind];
				if (q > 0)
					cart.add({
						itemId: waterItem.id,
						quantity: q,
						notes: kind,
						options: toCartOptions(waterItem, autoSelections(waterItem)),
						isSuggested: false
					});
			}
		}
	}

	function sendWithPicks() {
		commitPicks();
		onsend();
	}
	function sendWithout() {
		onsend();
	}
</script>

<Dialog {open} {onclose} size="md" title={promptHeading}>
	<div class="flex items-start justify-between gap-3 px-4 pt-4">
		<div>
			<h2 class="font-display text-xl font-bold text-ink-800">{promptHeading}</h2>
			<p class="mt-1 text-sm text-ink-400">{promptBody}</p>
		</div>
		<button
			type="button"
			onclick={() => { open = false; onclose(); }}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-600/8"
			aria-label="Close"
		>
			<Icon name="x" size={18} />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if showDrinks}
			<div class="grid grid-cols-2 gap-2">
				{#each drinks as d (d.id)}
					{@const q = qty[d.id] ?? 0}
					<div
						class="flex flex-col overflow-hidden rounded-xl border transition-colors {q > 0
							? 'border-lagoon-600 bg-lagoon-50'
							: 'border-ink-600/12 bg-sand-50'}"
						data-testid="beverage-option"
					>
						<div class="relative h-20 w-full">
							<img src={itemImage(d)} alt={d.name} class="h-full w-full object-cover" />
							{#if q > 0}
								<span class="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-lagoon-700 px-1.5 text-xs font-bold text-sand-50">{q}×</span>
							{/if}
						</div>
						<div class="flex flex-1 flex-col p-2">
							<span class="min-w-0 text-sm font-semibold leading-tight text-ink-800">{d.name}</span>
							<span class="mb-2 text-xs font-medium text-lagoon-700">{currency.format(d.basePrice)}</span>
							{#if q === 0}
								<button type="button" onclick={() => setQty(d.id, 1)} class="mt-auto inline-flex h-9 items-center justify-center gap-1 rounded-full bg-lagoon-600 text-sm font-semibold text-sand-50 hover:bg-lagoon-700" data-testid="beverage-add">
									<Icon name="plus" size={14} /> Add
								</button>
							{:else}
								<div class="mt-auto flex h-9 items-center justify-between rounded-full bg-lagoon-600 text-sand-50">
									<button type="button" onclick={() => setQty(d.id, q - 1)} class="flex h-9 w-10 items-center justify-center" aria-label="Decrease {d.name}"><Icon name="minus" size={16} /></button>
									<span class="text-sm font-bold tabular-nums" data-testid="beverage-qty">{q}</span>
									<button type="button" onclick={() => setQty(d.id, q + 1)} class="flex h-9 w-10 items-center justify-center" aria-label="Increase {d.name}"><Icon name="plus" size={16} /></button>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if showWater && waterItem}
			<div class="{showDrinks ? 'mt-5 border-t border-ink-600/10 pt-4' : ''}">
				<div class="mb-2 flex items-center gap-2">
					<span class="text-sm font-semibold text-ink-800">Water?</span>
					<span class="text-xs text-ink-400">{currency.format(waterItem.basePrice)} each</span>
				</div>
				<div class="grid grid-cols-2 gap-2">
					{#each ['Chilled', 'Unchilled'] as const as kind}
						{@const q = water[kind]}
						<div
							class="flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors {q > 0
								? 'border-lagoon-600 bg-lagoon-50'
								: 'border-ink-600/12 bg-sand-50'}"
							data-testid="water-option"
						>
							<span class="flex items-center gap-2 text-sm font-semibold text-ink-800">
								<Icon name={kind === 'Chilled' ? 'coins' : 'info'} size={16} class="text-lagoon-600" />
								{kind}
							</span>
							{#if q === 0}
								<button type="button" onclick={() => setWater(kind, 1)} class="inline-flex h-8 items-center gap-1 rounded-full bg-lagoon-600 px-3 text-sm font-semibold text-sand-50 hover:bg-lagoon-700" data-testid="water-add-{kind.toLowerCase()}">
									<Icon name="plus" size={14} /> Add
								</button>
							{:else}
								<div class="flex h-8 items-center gap-1 rounded-full bg-lagoon-600 text-sand-50">
									<button type="button" onclick={() => setWater(kind, q - 1)} class="flex h-8 w-8 items-center justify-center" aria-label="Fewer {kind} water"><Icon name="minus" size={15} /></button>
									<span class="min-w-4 text-center text-sm font-bold tabular-nums">{q}</span>
									<button type="button" onclick={() => setWater(kind, q + 1)} class="flex h-8 w-8 items-center justify-center" aria-label="More {kind} water"><Icon name="plus" size={15} /></button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-2 border-t border-ink-600/10 bg-sand-100 px-4 py-3 pb-safe-4">
		{#if totalPicked > 0}
			<Button variant="primary" size="lg" full onclick={sendWithPicks} data-testid="beverage-send">
				<Icon name="check" size={18} /> Add {totalPicked} & send order
			</Button>
			<Button variant="ghost" size="md" full onclick={sendWithout} data-testid="beverage-skip">{skipLabel}</Button>
		{:else}
			<Button variant="primary" size="lg" full onclick={sendWithout} data-testid="beverage-skip">
				<Icon name="check" size={18} /> {skipLabel}
			</Button>
		{/if}
	</div>
</Dialog>
