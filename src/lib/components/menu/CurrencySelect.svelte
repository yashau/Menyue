<script lang="ts">
	import { getCurrency } from '$lib/currency.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const currency = getCurrency();
</script>

<label class="relative flex items-center">
	<span class="sr-only">Display currency</span>
	<Icon name="coins" size={16} class="pointer-events-none absolute left-2.5 text-ink-400" />
	<select
		class="h-10 appearance-none rounded-full border border-ink-600/15 bg-sand-50 pl-8 pr-8 text-sm font-semibold text-ink-800 focus-visible:outline-2 focus-visible:outline-lagoon-500"
		value={currency.selectedCode}
		onchange={(e) => currency.select((e.currentTarget as HTMLSelectElement).value)}
		aria-label="Display currency"
		data-testid="currency-select"
	>
		{#each currency.options as opt}
			<option value={opt.code}>{opt.label}</option>
		{/each}
	</select>
	<Icon name="chevronDown" size={15} class="pointer-events-none absolute right-2.5 text-ink-400" />
</label>
