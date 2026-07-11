<script lang="ts">
	import type { Category } from '$lib/types';

	interface Props {
		categories: { category: Category; count: number }[];
		activeId: number | null;
		variant: 'horizontal' | 'rail';
		onselect: (id: number) => void;
	}
	let { categories, activeId, variant, onselect }: Props = $props();
</script>

{#if variant === 'horizontal'}
	<nav aria-label="Menu categories" class="no-scrollbar -mx-4 overflow-x-auto px-4">
		<ul class="flex w-max gap-2 py-2">
			{#each categories as { category, count }}
				<li>
					<button
						type="button"
						onclick={() => onselect(category.id)}
						aria-current={activeId === category.id ? 'true' : undefined}
						class="flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors
							{activeId === category.id
							? 'border-lagoon-600 bg-lagoon-600 text-sand-50'
							: 'border-ink-600/15 bg-sand-50 text-ink-700 hover:bg-sand-100'}"
					>
						{category.name}
						<span class="ml-1.5 opacity-60">{count}</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>
{:else}
	<nav aria-label="Menu categories" class="flex flex-col gap-0.5">
		{#each categories as { category, count }}
			<button
				type="button"
				onclick={() => onselect(category.id)}
				aria-current={activeId === category.id ? 'true' : undefined}
				class="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors
					{activeId === category.id
					? 'bg-lagoon-50 font-semibold text-lagoon-800'
					: 'text-ink-600 hover:bg-sand-100'}"
			>
				<span class="truncate">{category.name}</span>
				<span class="ml-2 shrink-0 text-xs text-ink-400">{count}</span>
			</button>
		{/each}
	</nav>
{/if}
