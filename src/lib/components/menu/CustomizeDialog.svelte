<script lang="ts">
	import type { MenuItem } from '$lib/types';
	import { getCart } from '$lib/cart.svelte';
	import { getCurrency } from '$lib/currency.svelte';
	import { itemImage } from '$lib/image';
	import {
		autoSelections,
		defaultSelections,
		selectionsFromOptions,
		toCartOptions,
		validate,
		type BuiltLine,
		type Selections
	} from '$lib/wizard';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import OptionGroups from './OptionGroups.svelte';
	import QtyStepper from './QtyStepper.svelte';

	interface Props {
		open: boolean;
		item: MenuItem;
		editUid?: string | null;
		oncommit?: (lines: BuiltLine[]) => void;
		onupdate?: (uid: string, line: BuiltLine) => void;
		onclose: () => void;
	}
	let { open = $bindable(), item, editUid = null, oncommit, onupdate, onclose }: Props = $props();

	const cart = getCart();
	const currency = getCurrency();

	let selections = $state<Selections>({});
	let quantity = $state(1);
	let notes = $state('');
	let stepIndex = $state(0);
	let showErrors = $state(false);
	// suggested items are chosen by quantity (added with sensible default options)
	let suggQty = $state<Record<number, number>>({});
	let heading = $state<HTMLHeadingElement | null>(null);

	const suggestionTargets = $derived(
		(item.suggestionIds ?? [])
			.map((id) => cart.item(id))
			.filter((it): it is MenuItem => !!it && it.enabled && it.availability === 'available')
	);

	const hasOptions = $derived(item.optionGroups.length > 0);
	const hasSuggestions = $derived(!editUid && suggestionTargets.length > 0);
	const steps = $derived(
		[hasOptions ? 'options' : null, hasSuggestions ? 'suggestions' : null, 'review'].filter(
			Boolean
		) as string[]
	);
	const stepId = $derived(steps[Math.min(stepIndex, steps.length - 1)]);

	const validation = $derived(validate(item, selections));
	const mainUnit = $derived(item.basePrice + validation.priceDelta);
	const mainLineTotal = $derived(mainUnit * quantity);

	function suggUnit(target: MenuItem): number {
		return cart.unitBase({ itemId: target.id, options: toCartOptions(target, autoSelections(target)) });
	}
	const suggestedLines = $derived(
		suggestionTargets
			.filter((t) => (suggQty[t.id] ?? 0) > 0)
			.map((t) => ({
				itemId: t.id,
				quantity: suggQty[t.id],
				notes: '',
				options: toCartOptions(t, autoSelections(t)),
				isSuggested: true
			}))
	);
	const suggestedTotal = $derived(
		suggestionTargets.reduce((s, t) => s + (suggQty[t.id] ?? 0) * suggUnit(t), 0)
	);
	const grandTotal = $derived(mainLineTotal + suggestedTotal);

	function init() {
		if (editUid) {
			const line = cart.find(editUid);
			if (line) {
				selections = selectionsFromOptions(item, line.options);
				quantity = line.quantity;
				notes = line.notes;
			}
		} else {
			selections = defaultSelections(item);
			quantity = 1;
			notes = '';
		}
		suggQty = {};
		stepIndex = 0;
		showErrors = false;
	}

	let lastOpen = false;
	$effect(() => {
		if (open && !lastOpen) init();
		lastOpen = open;
		if (open) queueMicrotask(() => heading?.focus());
	});

	function next() {
		if (stepId === 'options' && !validation.valid) {
			showErrors = true;
			return;
		}
		if (stepIndex < steps.length - 1) stepIndex += 1;
	}
	function back() {
		if (stepIndex > 0) stepIndex -= 1;
	}

	function setSugg(id: number, v: number) {
		suggQty = { ...suggQty, [id]: Math.max(0, Math.min(20, v)) };
	}

	function buildMain(): BuiltLine {
		return {
			itemId: item.id,
			quantity,
			notes: notes.trim(),
			options: toCartOptions(item, selections),
			isSuggested: false
		};
	}

	function commit(another = false) {
		if (!validation.valid) {
			showErrors = true;
			if (steps.includes('options')) stepIndex = steps.indexOf('options');
			return;
		}
		const main = buildMain();
		if (editUid && onupdate) {
			onupdate(editUid, main);
			open = false;
			onclose();
			return;
		}
		oncommit?.([main, ...suggestedLines]);
		if (another) {
			// commit this configuration and start a fresh one for the SAME item
			// (e.g. one spicy, one mild) — full wizard again, keeps dialog open
			init();
		} else {
			open = false;
			onclose();
		}
	}

	const title = $derived(editUid ? `Edit ${item.name}` : item.name);
</script>

<Dialog {open} {onclose} size="lg" {title}>
	<!-- Header -->
	<div class="relative">
		<div class="h-28 w-full overflow-hidden sm:h-32">
			<img src={itemImage(item)} alt={item.name} class="h-full w-full object-cover" />
			<div class="absolute inset-0 bg-gradient-to-t from-ink-900/60 to-transparent"></div>
		</div>
		<button
			type="button"
			onclick={() => { open = false; onclose(); }}
			class="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-sand-50/90 text-ink-800 shadow"
			aria-label="Close"
		>
			<Icon name="x" size={18} />
		</button>
		<div class="absolute bottom-2 left-4 right-4">
			<h2 bind:this={heading} tabindex="-1" class="font-display text-xl font-bold text-sand-50 outline-none drop-shadow">
				{title}
			</h2>
		</div>
	</div>

	<!-- Progress -->
	{#if steps.length > 1}
		<div class="flex items-center gap-2 px-4 pt-3" aria-hidden="true">
			{#each steps as s, i}
				<div class="h-1.5 flex-1 rounded-full {i <= stepIndex ? 'bg-lagoon-600' : 'bg-ink-600/12'}"></div>
			{/each}
		</div>
	{/if}
	<div class="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
		Step {stepIndex + 1} of {steps.length}
		{#if stepId === 'options'}· Options{:else if stepId === 'suggestions'}· Goes well with{:else}· Review{/if}
	</div>

	<!-- Body -->
	<div class="flex-1 overflow-y-auto px-4 py-3">
		<!-- main-item quantity, set on the first step (before suggestions) -->
		{#if stepIndex === 0 && stepId !== 'review'}
			<div class="mb-3 flex items-center justify-between gap-2 rounded-xl border border-ink-600/12 bg-sand-50 p-3">
				<div class="min-w-0">
					<div class="text-sm font-semibold text-ink-800">How many?</div>
					<div class="truncate text-xs text-ink-400">{item.name} · {currency.format(mainUnit)} each</div>
				</div>
				<QtyStepper value={quantity} onchange={(v) => (quantity = v)} />
			</div>
		{/if}

		{#if stepId === 'options'}
			{#if item.description}
				<p class="mb-3 text-sm text-ink-400">{item.description}</p>
			{/if}
			<OptionGroups
				{item}
				{selections}
				errors={validation.errors}
				{showErrors}
				onchange={(s) => (selections = s)}
			/>
		{:else if stepId === 'suggestions'}
			<p class="mb-3 text-sm text-ink-400">Add something that pairs well — tap to add, choose how many. Nothing is added until you confirm.</p>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{#each suggestionTargets as target (target.id)}
					{@const q = suggQty[target.id] ?? 0}
					{@const inCart = cart.hasItem(target.id)}
					<div
						class="flex items-center gap-3 rounded-xl border p-2 transition-colors {q > 0
							? 'border-lagoon-600 bg-lagoon-50'
							: 'border-ink-600/12 bg-sand-50'}"
						data-testid="suggestion"
					>
						<img src={itemImage(target)} alt={target.name} class="h-14 w-14 shrink-0 rounded-lg object-cover" />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="truncate text-sm font-semibold text-ink-800">{target.name}</span>
								{#if inCart}<span class="rounded-full bg-sand-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">in cart</span>{/if}
							</div>
							<div class="text-xs text-ink-400">{currency.format(target.basePrice)}</div>
						</div>
						{#if q === 0}
							<button type="button" onclick={() => setSugg(target.id, 1)} class="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-lagoon-600 px-3.5 text-[13px] font-semibold text-sand-50 hover:bg-lagoon-700" data-testid="suggestion-add">
								<Icon name="plus" size={14} /> Add
							</button>
						{:else}
							<div class="flex h-9 shrink-0 items-center rounded-full bg-lagoon-600 text-sand-50">
								<button type="button" onclick={() => setSugg(target.id, q - 1)} class="flex h-9 w-9 items-center justify-center" aria-label="Fewer {target.name}"><Icon name="minus" size={16} /></button>
								<span class="min-w-5 text-center text-sm font-bold tabular-nums">{q}</span>
								<button type="button" onclick={() => setSugg(target.id, q + 1)} class="flex h-9 w-9 items-center justify-center" aria-label="More {target.name}"><Icon name="plus" size={16} /></button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Review -->
			<div class="flex flex-col gap-3">
				<div class="rounded-xl border border-ink-600/12 bg-sand-50 p-3">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="font-semibold text-ink-800">{quantity}× {item.name}</div>
							{#each toCartOptions(item, selections) as o}
								<div class="text-xs text-ink-400">{o.groupName}: {o.choiceName}{o.priceAdjustment ? ` (+${currency.format(o.priceAdjustment)})` : ''}</div>
							{/each}
						</div>
						<div class="shrink-0 font-display font-semibold text-ink-800">{currency.format(mainLineTotal)}</div>
					</div>
					{#if steps.length === 1}
						<!-- only place to set quantity when there's no earlier step -->
						<div class="mt-3"><QtyStepper value={quantity} onchange={(v) => (quantity = v)} /></div>
					{/if}
					<label class="mt-3 block">
						<span class="text-xs font-medium text-ink-600">Notes for the kitchen (optional)</span>
						<textarea
							bind:value={notes}
							rows="2"
							maxlength="300"
							placeholder="e.g. no coriander, allergy info"
							class="mt-1 w-full rounded-lg border border-ink-600/15 bg-sand-50 p-2 text-sm focus-visible:outline-2 focus-visible:outline-lagoon-500"
						></textarea>
					</label>
				</div>

				{#if !editUid && hasOptions}
					<button
						type="button"
						onclick={() => commit(true)}
						class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-lagoon-500/60 py-3 text-sm font-semibold text-lagoon-700 hover:bg-lagoon-50"
						data-testid="wizard-add-another"
					>
						<Icon name="plus" size={16} /> Add this one and choose another
					</button>
					<p class="-mt-1 text-center text-xs text-ink-400">
						Want them different — one spicy, one not? Add this, then pick options again.
					</p>
				{/if}

				{#if suggestedLines.length}
					<div class="rounded-xl border border-ink-600/12 bg-sand-50 p-3">
						<div class="mb-1 text-xs font-semibold text-ink-600">Added with this</div>
						{#each suggestedLines as s}
							{@const sItem = cart.item(s.itemId)}
							<div class="flex items-center justify-between gap-2 py-1">
								<div class="text-sm text-ink-800">{s.quantity}× {sItem?.name}</div>
								<div class="shrink-0 text-sm font-medium text-ink-700">{currency.format(cart.unitBase(s) * s.quantity)}</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if currency.isConverted}
					<p class="text-center text-xs text-ink-400">{currency.freshnessNote}</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="flex items-center gap-2 border-t border-ink-600/10 bg-sand-100 px-4 py-3 pb-safe-4">
		{#if stepIndex > 0}
			<Button variant="outline" size="md" onclick={back}>
				<Icon name="chevronLeft" size={16} /> Back
			</Button>
		{/if}
		<div class="flex-1 text-sm">
			<span class="text-ink-400">Total</span>
			<span class="ml-1 font-display text-lg font-bold text-ink-800" data-testid="wizard-total">{currency.format(grandTotal)}</span>
		</div>
		{#if stepId !== 'review'}
			<Button variant="primary" size="md" onclick={next} data-testid="wizard-next">
				Next <Icon name="chevronRight" size={16} />
			</Button>
		{:else}
			<Button variant="primary" size="md" onclick={() => commit(false)} data-testid="wizard-confirm">
				<Icon name="check" size={16} />
				{editUid ? 'Save changes' : 'Add to order'}
			</Button>
		{/if}
	</div>
</Dialog>
