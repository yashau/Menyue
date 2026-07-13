<script lang="ts">
	import { currencyLabel, type ClientBaseCurrency, type ClientDisplayCurrency } from '$lib/currency';

	type Props = {
		base: ClientBaseCurrency;
		quotes?: ClientDisplayCurrency[];
		value?: string;
		testId?: string;
	};

	let { base, quotes = [], value = $bindable(''), testId = 'currency-selector' }: Props = $props();
	const options = $derived([
		{ code: base.code, label: currencyLabel(base.code, base.locale), detail: 'Restaurant currency', value: '' },
		...quotes.map((quote) => ({
			code: quote.code,
			label: currencyLabel(quote.code, quote.locale ?? base.locale),
			detail: quote.freshness === 'stale' ? 'Estimated rate' : quote.source === 'fixed' ? 'Restaurant rate' : 'Current rate',
			value: quote.code,
		})),
	]);
</script>

{#if options.length > 1}
	<fieldset class="customer-currency-selector" aria-label="Display currency" data-testid={testId}>
		<legend class="sr-only">Display currency</legend>
		{#each options as option}
			<button
				type="button"
				class:active={value === option.value}
				aria-pressed={value === option.value}
				aria-label={`Display prices in ${option.label} (${option.code})${option.detail ? `, ${option.detail}` : ''}`}
				title={`${option.label} (${option.code}) — ${option.detail}`}
				onclick={() => value = option.value}
			>
				<span aria-hidden="true">{option.code}</span>
				<span class="sr-only">{option.label}</span>
			</button>
		{/each}
	</fieldset>
{/if}

<style>
	.customer-currency-selector { display: inline-flex; min-height: 2.75rem; margin: 0; border: 1px solid var(--customer-border); border-radius: 999px; padding: 0.2rem; background: var(--customer-surface); }
	.customer-currency-selector button { min-width: 3.5rem; border: 0; border-radius: 999px; background: transparent; padding: 0.45rem 0.7rem; color: var(--customer-ink); font: inherit; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.04em; cursor: pointer; }
	.customer-currency-selector button:hover { background: color-mix(in oklch, var(--customer-surface) 82%, var(--customer-primary)); }
	.customer-currency-selector button.active { background: var(--customer-primary); color: var(--customer-primary-foreground); }
	.customer-currency-selector button:focus-visible { outline: 3px solid var(--customer-focus); outline-offset: 2px; }
	@media (max-width: 760px) {
		.customer-currency-selector button { min-width: 44px; min-height: 44px; padding-inline: 0.4rem; }
	}
</style>
