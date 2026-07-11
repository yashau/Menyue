<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'neutral' | 'lagoon' | 'coral' | 'sand' | 'warn' | 'muted';
		size?: 'xs' | 'sm';
		children: Snippet;
	}
	let { tone = 'neutral', size = 'xs', children }: Props = $props();

	const tones = {
		neutral: 'bg-ink-600/8 text-ink-700',
		lagoon: 'bg-lagoon-100 text-lagoon-800',
		coral: 'bg-coral-100 text-coral-700',
		sand: 'bg-sand-200 text-ink-700',
		warn: 'bg-amber-100 text-amber-800',
		muted: 'bg-ink-600/5 text-ink-400'
	};
	const sizes = { xs: 'text-[11px] px-2 py-0.5', sm: 'text-xs px-2.5 py-1' };
</script>

<span class="inline-flex items-center gap-1 rounded-full font-medium {tones[tone]} {sizes[size]}">
	{@render children()}
</span>
