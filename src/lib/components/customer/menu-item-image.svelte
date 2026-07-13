<script lang="ts">
	import { customerMenuImageSource } from '$lib/customer-menu';
	import type { PublicItem } from '$lib/types';

	type Props = { item: Pick<PublicItem, 'name' | 'photoId' | 'imageUrl'>; className?: string };
	let { item, className = '' }: Props = $props();
	let failed = $state(false);
	const source = $derived(customerMenuImageSource(item));
	const initial = $derived(item.name.trim().slice(0, 1).toUpperCase() || '•');
</script>

{#if source && !failed}
	<img class={className} src={source} alt="" loading="lazy" onerror={() => failed = true} />
{:else}
	<span class={`menu-image-fallback ${className}`} aria-hidden="true">{initial}</span>
{/if}

<style>
	.menu-image-fallback { display: grid; width: 100%; height: 100%; min-height: inherit; place-items: center; }
</style>
