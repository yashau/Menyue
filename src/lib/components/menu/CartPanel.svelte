<script lang="ts">
	import type { CartLine } from '$lib/types';
	import { getCart } from '$lib/cart.svelte';
	import { getCurrency } from '$lib/currency.svelte';
	import { itemImage } from '$lib/image';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import QtyStepper from './QtyStepper.svelte';

	interface Props {
		onedit: (line: CartLine) => void;
		oncheckout: () => void;
		submitting?: boolean;
	}
	let { onedit, oncheckout, submitting = false }: Props = $props();

	const cart = getCart();
	const currency = getCurrency();
</script>

<div class="flex h-full flex-col">
	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if cart.lines.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 py-14 text-center">
				<span class="flex h-14 w-14 items-center justify-center rounded-full bg-sand-200 text-ink-400">
					<Icon name="cart" size={26} />
				</span>
				<p class="font-display text-lg font-semibold text-ink-700">Your order is empty</p>
				<p class="max-w-56 text-sm text-ink-400">Browse the menu and add a few dishes to get started.</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each cart.lines as line (line.uid)}
					{@const item = cart.item(line.itemId)}
					<li class="rounded-xl border border-ink-600/10 bg-sand-50 p-3" data-testid="cart-line">
						<div class="flex gap-3">
							<img
								src={itemImage(item)}
								alt={item?.name}
								class="h-16 w-16 shrink-0 rounded-lg object-cover"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<div class="truncate text-sm font-semibold text-ink-800">
											{item?.name}
											{#if line.isSuggested}
												<span class="ml-1 rounded-full bg-coral-100 px-1.5 py-0.5 text-[10px] font-medium text-coral-700">suggested</span>
											{/if}
										</div>
										{#each line.options as o}
											<div class="text-xs text-ink-400">{o.groupName}: {o.choiceName}</div>
										{/each}
										{#if line.notes}
											<div class="mt-0.5 text-xs italic text-ink-400">“{line.notes}”</div>
										{/if}
									</div>
									<button
										type="button"
										onclick={() => cart.remove(line.uid)}
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-coral-50 hover:text-coral-600"
										aria-label="Remove {item?.name}"
									>
										<Icon name="trash" size={16} />
									</button>
								</div>
								<div class="mt-2 flex items-center justify-between gap-2">
									<QtyStepper value={line.quantity} onchange={(v) => cart.setQuantity(line.uid, v)} />
									<div class="text-right">
										<div class="font-display text-sm font-semibold text-ink-800">
											{currency.format(cart.lineTotalBase(line))}
										</div>
										{#if (item?.optionGroups.length ?? 0) > 0}
											<button type="button" class="text-xs font-medium text-lagoon-700 hover:underline" onclick={() => onedit(line)}>
												Edit options
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if cart.lines.length > 0}
		<div class="border-t border-ink-600/10 bg-sand-100 px-4 py-3 pb-safe-4">
			<div class="mb-1 flex items-center justify-between">
				<span class="text-sm text-ink-600">Subtotal</span>
				<span class="font-display text-xl font-bold text-ink-800" data-testid="cart-subtotal">
					{currency.format(cart.subtotalBase)}
				</span>
			</div>
			{#if currency.isConverted}
				<p class="mb-2 flex items-center gap-1 text-xs text-ink-400">
					<Icon name="info" size={12} />
					{currency.freshnessNote}. Charged in {currency.base.code}.
				</p>
			{/if}
			<Button variant="primary" size="lg" full onclick={oncheckout} disabled={submitting} data-testid="checkout-btn">
				{#if submitting}
					Sending…
				{:else}
					<Icon name="arrowRight" size={18} /> Send order to kitchen
				{/if}
			</Button>
		</div>
	{/if}
</div>
