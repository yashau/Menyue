<script lang="ts">
	import type { MenuItem } from '$lib/types';
	import { getCurrency } from '$lib/currency.svelte';
	import { effectiveMin, offersNone, type Selections } from '$lib/wizard';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		item: MenuItem;
		selections: Selections;
		errors: Record<number, string>;
		showErrors: boolean;
		onchange: (selections: Selections) => void;
	}
	let { item, selections, errors, showErrors, onchange }: Props = $props();
	const currency = getCurrency();

	function priceLabel(adj: number): string {
		if (adj === 0) return '';
		return `+${currency.format(adj)}`;
	}

	function toggleSingle(groupId: number, choiceId: number | null) {
		onchange({ ...selections, [groupId]: choiceId === null ? [] : [choiceId] });
	}

	function toggleMulti(groupId: number, choiceId: number, maxSelect: number) {
		const cur = selections[groupId] ?? [];
		let next: number[];
		if (cur.includes(choiceId)) {
			next = cur.filter((c) => c !== choiceId);
		} else {
			if (maxSelect > 0 && cur.length >= maxSelect) return; // block over-select
			next = [...cur, choiceId];
		}
		onchange({ ...selections, [groupId]: next });
	}
</script>

<div class="flex flex-col gap-5">
	{#each item.optionGroups as group (group.id)}
		{@const chosen = selections[group.id] ?? []}
		{@const min = effectiveMin(group)}
		{@const err = showErrors ? errors[group.id] : undefined}
		<fieldset
			class="rounded-xl border p-3 {err ? 'border-coral-400 bg-coral-50/60' : 'border-ink-600/10 bg-sand-50'}"
			data-invalid={err ? 'true' : undefined}
			data-testid="option-group"
			data-group-id={group.id}
		>
			<legend class="flex w-full items-center justify-between gap-2 px-1">
				<span class="text-sm font-semibold text-ink-800">{group.name}</span>
				<span class="text-[11px] font-medium text-ink-400">
					{#if group.required && !group.allowNone}
						Required
					{:else if group.selectionType === 'multiple'}
						Optional{group.maxSelect > 0 ? ` · up to ${group.maxSelect}` : ''}
					{:else}
						Optional
					{/if}
				</span>
			</legend>

			<div class="mt-2 flex flex-col gap-1.5">
				{#if group.selectionType === 'single'}
					{#if offersNone(group)}
						<label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-sand-100">
							<input
								type="radio"
								name="group-{group.id}"
								class="h-5 w-5 accent-lagoon-600"
								checked={chosen.length === 0}
								onchange={() => toggleSingle(group.id, null)}
							/>
							<span class="text-sm text-ink-700">None</span>
						</label>
					{/if}
					{#each group.choices as choice (choice.id)}
						<label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-sand-100">
							<input
								type="radio"
								name="group-{group.id}"
								class="h-5 w-5 accent-lagoon-600"
								checked={chosen.includes(choice.id)}
								onchange={() => toggleSingle(group.id, choice.id)}
							/>
							<span class="flex-1 text-sm text-ink-800">{choice.name}</span>
							{#if choice.priceAdjustment}
								<span class="text-sm font-medium text-lagoon-700">{priceLabel(choice.priceAdjustment)}</span>
							{/if}
						</label>
					{/each}
				{:else}
					{#each group.choices as choice (choice.id)}
						{@const active = chosen.includes(choice.id)}
						{@const full = group.maxSelect > 0 && chosen.length >= group.maxSelect && !active}
						<label
							class="flex min-h-11 items-center gap-3 rounded-lg px-2 {full ? 'opacity-40' : 'cursor-pointer hover:bg-sand-100'}"
						>
							<input
								type="checkbox"
								class="h-5 w-5 rounded accent-lagoon-600"
								checked={active}
								disabled={full}
								onchange={() => toggleMulti(group.id, choice.id, group.maxSelect)}
							/>
							<span class="flex-1 text-sm text-ink-800">{choice.name}</span>
							{#if choice.priceAdjustment}
								<span class="text-sm font-medium text-lagoon-700">{priceLabel(choice.priceAdjustment)}</span>
							{/if}
						</label>
					{/each}
				{/if}
			</div>

			{#if err}
				<p class="mt-1.5 flex items-center gap-1 px-1 text-xs font-medium text-coral-700" role="alert">
					<Icon name="alert" size={13} /> {err}
				</p>
			{/if}
		</fieldset>
	{/each}
</div>
