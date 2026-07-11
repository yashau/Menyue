<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		logoKey?: string | null;
		size?: number;
		tone?: 'primary' | 'dark' | 'light';
	}
	let { logoKey = null, size = 36, tone = 'primary' }: Props = $props();

	const bg = { primary: 'bg-lagoon-700', dark: 'bg-lagoon-600', light: 'bg-sand-50/15' }[tone];
</script>

{#if logoKey}
	<img
		src={`/media/${logoKey}`}
		alt="Logo"
		class="shrink-0 rounded-lg object-cover"
		style="width:{size}px;height:{size}px"
	/>
{:else}
	<span
		class="flex shrink-0 items-center justify-center rounded-lg text-sand-50 {bg}"
		style="width:{size}px;height:{size}px"
	>
		<Icon name="leaf" size={Math.round(size * 0.55)} />
	</span>
{/if}
