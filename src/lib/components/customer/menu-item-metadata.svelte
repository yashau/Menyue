<script lang="ts">
	import { customerAllergyNotices } from '$lib/customer-menu';
	import type { PublicItem } from '$lib/types';

	type Props = { item: Pick<PublicItem, 'promotion' | 'dietaryLabels' | 'tags' | 'allergyNote' | 'allergens'> };
	let { item }: Props = $props();
	const allergies = $derived(customerAllergyNotices(item));
</script>

{#if item.promotion}
	<p class="customer-promotion"><b>Offer · {item.promotion.label}</b>{#if item.promotion.description}<span>{item.promotion.description}</span>{/if}</p>
{/if}
{#if item.dietaryLabels?.length || item.tags?.length}
	<ul class="customer-menu-metadata" aria-label="Dish labels">
		{#each item.dietaryLabels ?? [] as label}<li class="dietary">Dietary · {label}</li>{/each}
		{#each item.tags ?? [] as tag}<li>Tag · {tag}</li>{/each}
	</ul>
{/if}
{#if allergies.length}
	<ul class="customer-allergy-notices" aria-label="Allergy information">
		{#each allergies as allergy}<li>{allergy}</li>{/each}
	</ul>
{/if}

<style>
	.customer-promotion { display: grid; gap: 0.18rem; margin: 0.45rem 0; color: #b64d31; font-size: 0.75rem; line-height: 1.35; }
	.customer-promotion b { font-weight: 800; letter-spacing: 0.035em; text-transform: uppercase; }
	.customer-menu-metadata, .customer-allergy-notices { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
	.customer-menu-metadata li, .customer-allergy-notices li { border: 1px solid #d9d0c0; border-radius: 999px; padding: 0.22rem 0.45rem; color: #53675e; font-size: 0.68rem; line-height: 1.3; }
	.customer-menu-metadata .dietary { border-color: #9fb7a6; background: #edf5ed; color: #365f45; }
	.customer-allergy-notices li { border-color: #dec5a2; background: #fff7e9; color: #77552a; }
</style>
