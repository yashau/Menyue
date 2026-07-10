<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	type L = { itemId: string; quantity: number; choiceIds: string[] };
	let cart = $state<L[]>([]),
		message = $state(''),
		key = $state(crypto.randomUUID());
	const line = (id: string) => cart.find((x) => x.itemId === id);
	const money = (minor: number) =>
		new Intl.NumberFormat('en', { style: 'currency', currency: data.menu.currency }).format(
			minor / 100,
		);
	const add = (id: string) => {
		const x = line(id);
		cart = x
			? cart.map((a) => (a.itemId === id ? { ...a, quantity: a.quantity + 1 } : a))
			: [...cart, { itemId: id, quantity: 1, choiceIds: [] }];
	};
	const choose = (item: string, id: string) => {
		const x = line(item) ?? { itemId: item, quantity: 1, choiceIds: [] };
		cart = cart
			.filter((a) => a.itemId !== item)
			.concat({
				...x,
				choiceIds: x.choiceIds.includes(id)
					? x.choiceIds.filter((a) => a !== id)
					: [...x.choiceIds, id],
			});
	};
	async function submit() {
		const r = await fetch(`/api/tables/${location.pathname.split('/').pop()}/orders`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ idempotencyKey: key, lines: cart }),
		});
		const body = (await r.json()) as { message?: string };
		message = r.ok ? 'Order sent' : (body.message ?? 'Unable to send order');
	}
</script>

<main class="mx-auto max-w-3xl p-6">
	<h1 class="text-3xl font-semibold">Table {data.table.label}</h1>
	{#each data.menu.categories as c}<h2 class="mt-8 text-xl">{c.name}</h2>
		{#each c.items as i}<article class="mt-3 rounded bg-white p-4">
				<div class="flex justify-between">
					<strong>{i.name}</strong><span>{money(i.promotion?.priceMinor ?? i.priceMinor)}</span>
				</div>
				{#if i.photoId}<img
						class="mt-3 h-40 w-full object-cover"
						src={`/media/${i.photoId}`}
						alt={i.name}
					/>{/if}{#if i.promotion}<p>
						{i.promotion.label}{#if i.promotion.description}: {i.promotion.description}{/if}
					</p>{/if}{#if i.allergens?.length}<p>
						Allergens: {i.allergens.map((a) => a.name).join(', ')}
					</p>{/if}{#each i.comboGroups ?? [] as g}<fieldset>
						<legend>{g.name} ({g.minChoices}-{g.maxChoices})</legend>{#each g.choices as o}<label
								><input
									type="checkbox"
									checked={line(i.id)?.choiceIds.includes(o.id) ?? false}
									onchange={() => choose(i.id, o.id)}
								/>{o.name}{o.priceDeltaMinor ? ` +${money(o.priceDeltaMinor)}` : ''}</label
							>{/each}
					</fieldset>{/each}<Button size="sm" onclick={() => add(i.id)}
					>Add {line(i.id)?.quantity ?? ''}</Button
				>
			</article>{/each}{/each}
	<div class="sticky bottom-3 rounded bg-stone-950 p-4 text-white">
		{cart.length} dishes <Button class="float-right" onclick={submit}>Submit</Button>{message}
	</div>
</main>
