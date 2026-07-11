<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		value: number;
		min?: number;
		max?: number;
		label?: string;
		onchange: (v: number) => void;
	}
	let { value, min = 1, max = 50, label = 'Quantity', onchange }: Props = $props();

	function dec() {
		if (value > min) onchange(value - 1);
	}
	function inc() {
		if (value < max) onchange(value + 1);
	}
</script>

<div class="inline-flex items-center rounded-full border border-ink-600/15 bg-sand-50" role="group" aria-label={label}>
	<button
		type="button"
		onclick={dec}
		disabled={value <= min}
		class="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 disabled:opacity-40"
		aria-label="Decrease quantity"
	>
		<Icon name="minus" size={18} />
	</button>
	<span class="min-w-8 text-center text-base font-bold tabular-nums" aria-live="polite" data-testid="qty-value">{value}</span>
	<button
		type="button"
		onclick={inc}
		disabled={value >= max}
		class="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 disabled:opacity-40"
		aria-label="Increase quantity"
	>
		<Icon name="plus" size={18} />
	</button>
</div>
