<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { CartLine, MenuItem } from '$lib/types';
	import { Cart, setCart } from '$lib/cart.svelte';
	import { CurrencyController, setCurrency } from '$lib/currency.svelte';
	import type { BuiltLine } from '$lib/wizard';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import BrandMark from '$lib/components/ui/BrandMark.svelte';
	import CurrencySelect from '$lib/components/menu/CurrencySelect.svelte';
	import CategoryNav from '$lib/components/menu/CategoryNav.svelte';
	import ItemCard from '$lib/components/menu/ItemCard.svelte';
	import CustomizeDialog from '$lib/components/menu/CustomizeDialog.svelte';
	import CartPanel from '$lib/components/menu/CartPanel.svelte';
	import BeveragePromptDialog from '$lib/components/menu/BeveragePromptDialog.svelte';
	import ConfirmationDialog from '$lib/components/menu/ConfirmationDialog.svelte';

	let { data } = $props();

	// contexts
	const cart = new Cart(data.token, data.items);
	setCart(cart);
	const currency = new CurrencyController(data.restaurant.base, data.currencies, data.rates, data.restaurant.slug);
	setCurrency(currency);

	// ---- search & grouping ----
	const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
	// Only "listed" items appear in the browse menu / search. Unlisted items
	// (suggestion-only, e.g. poppadums) are still in data.items so the cart and
	// the wizard's suggestions can resolve and order them.
	const menuItems = data.items.filter((i) => i.listed);
	const searchIndex = new Map(
		menuItems.map((i) => [
			i.id,
			`${i.name} ${i.description ?? ''} ${i.tags.join(' ')} ${i.allergens.join(' ')} ${i.dietary.join(' ')} ${categoryName.get(i.categoryId ?? -1) ?? ''}`.toLowerCase()
		])
	);
	let query = $state('');
	const q = $derived(query.trim().toLowerCase());
	const filtered = $derived(
		q ? menuItems.filter((i) => (searchIndex.get(i.id) ?? '').includes(q)) : menuItems
	);
	const groups = $derived(
		data.categories
			.map((c) => ({ category: c, items: filtered.filter((i) => i.categoryId === c.id) }))
			.filter((g) => g.items.length > 0)
	);
	const navCats = $derived(groups.map((g) => ({ category: g.category, count: g.items.length })));

	// ---- active category tracking ----
	let activeId = $state<number | null>(null);
	let intersecting = new Map<number, boolean>();

	onMount(() => {
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					const id = Number((e.target as HTMLElement).dataset.catSection);
					intersecting.set(id, e.isIntersecting);
				}
				const first = groups.find((g) => intersecting.get(g.category.id));
				if (first) activeId = first.category.id;
			},
			{ rootMargin: '-150px 0px -55% 0px', threshold: 0 }
		);
		const observeAll = () => {
			document.querySelectorAll('[data-cat-section]').forEach((el) => obs.observe(el));
		};
		observeAll();
		if (groups.length) activeId = groups[0].category.id;
		return () => obs.disconnect();
	});

	async function scrollToCategory(id: number) {
		activeId = id;
		await tick();
		document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ---- wizard ----
	let wizardOpen = $state(false);
	let wizardItem = $state<MenuItem | null>(null);
	let wizardEditUid = $state<string | null>(null);

	function customize(item: MenuItem) {
		wizardItem = item;
		wizardEditUid = null;
		wizardOpen = true;
	}
	function editLine(line: CartLine) {
		const it = cart.item(line.itemId);
		if (!it) return;
		wizardItem = it;
		wizardEditUid = line.uid;
		wizardOpen = true;
	}
	function quickAdd(item: MenuItem) {
		cart.add({ itemId: item.id, quantity: 1, notes: '', options: [], isSuggested: false });
	}
	function onCommit(lines: BuiltLine[]) {
		for (const l of lines) cart.add(l);
	}
	function onUpdate(uid: string, line: BuiltLine) {
		cart.update(uid, { quantity: line.quantity, notes: line.notes, options: line.options });
	}

	// ---- beverage prompt eligibility ----
	const eligibleDrinks = $derived.by(() => {
		const catSet = new Set(data.beverage.categoryIds);
		const idSet = new Set(data.beverage.itemIds);
		const byId = new Map(data.items.map((i) => [i.id, i]));
		const out: MenuItem[] = [];
		const seen = new Set<number>();
		// configured items first, in order
		for (const id of data.beverage.itemIds) {
			const it = byId.get(id);
			if (it && it.enabled && it.availability === 'available' && !seen.has(id)) {
				out.push(it);
				seen.add(id);
			}
		}
		for (const it of data.items) {
			if (seen.has(it.id)) continue;
			if (it.enabled && it.availability === 'available' && (catSet.has(it.categoryId ?? -1) || idSet.has(it.id))) {
				out.push(it);
				seen.add(it.id);
			}
		}
		return out.slice(0, 8);
	});

	// Water is handled separately from other drinks (offered chilled/unchilled).
	const waterCatId = data.categories.find((c) => c.name.trim().toLowerCase() === 'water')?.id ?? null;
	const itemsById = new Map(data.items.map((i) => [i.id, i]));
	const isWater = (it: MenuItem | undefined) => !!it && it.categoryId === waterCatId;
	const waterItem =
		data.items.find(
			(i) =>
				isWater(i) &&
				i.enabled &&
				i.availability === 'available' &&
				/water/i.test(i.name) &&
				!/sparkling|coconut/i.test(i.name)
		) ??
		data.items.find((i) => isWater(i) && i.enabled && i.availability === 'available') ??
		null;

	const drinksForPrompt = $derived(eligibleDrinks.filter((d) => !isWater(d)));
	// already chose a drink (non-water) from the menu?
	const hasDrink = $derived(
		cart.lines.some((l) => {
			const it = itemsById.get(l.itemId);
			return !!it && it.isBeverage && !isWater(it);
		})
	);
	const hasWater = $derived(cart.lines.some((l) => isWater(itemsById.get(l.itemId))));
	const showDrinks = $derived(!hasDrink && drinksForPrompt.length > 0);
	const showWater = $derived(!hasWater && !!waterItem);

	function shouldPromptBeverage(): boolean {
		if (!data.beverage.enabled || cart.beveragePromptSeen) return false;
		return showDrinks || showWater;
	}

	// ---- cart / checkout ----
	let cartSheetOpen = $state(false);
	let beverageOpen = $state(false);
	let confirmationOpen = $state(false);
	let confirmation = $state<{ number: string; table: string } | null>(null);
	let submitting = $state(false);
	let errorMsg = $state('');
	let currentKey: string | null = null;

	function checkout() {
		errorMsg = '';
		if (shouldPromptBeverage()) {
			beverageOpen = true;
		} else {
			void submit();
		}
	}

	function beverageSend() {
		cart.beveragePromptSeen = true;
		beverageOpen = false;
		void submit();
	}
	function beverageCancel() {
		cart.beveragePromptSeen = true;
		beverageOpen = false;
	}

	async function ensureKey(): Promise<string> {
		if (currentKey) return currentKey;
		const res = await fetch(`/t/${data.token}/key`, { method: 'POST' });
		if (!res.ok) throw new Error('Could not start checkout. Please try again.');
		const body = (await res.json()) as { key: string };
		currentKey = body.key;
		return currentKey;
	}

	async function submit() {
		if (cart.lines.length === 0 || submitting) return;
		submitting = true;
		errorMsg = '';
		try {
			const key = await ensureKey();
			const payload = {
				idempotencyKey: key,
				displayCurrencyCode: currency.selectedCode,
				lines: cart.lines.map((l) => ({
					itemId: l.itemId,
					quantity: l.quantity,
					notes: l.notes,
					isSuggested: l.isSuggested,
					options: l.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId }))
				}))
			};
			const res = await fetch(`/t/${data.token}/order`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const e = (await res.json().catch(() => ({ message: 'Order failed. Please try again.' }))) as {
					message?: string;
				};
				throw new Error(e.message ?? 'Order failed. Please try again.');
			}
			const result = (await res.json()) as {
				status: string;
				order: { number: string; tableLabel: string };
				nextKey: string;
			};
			currentKey = result.nextKey; // rotate for the next distinct order
			confirmation = { number: result.order.number, table: result.order.tableLabel };
			cart.clear();
			cart.beveragePromptSeen = false;
			cartSheetOpen = false;
			confirmationOpen = true;
		} catch (err) {
			// Keep currentKey so a retry after a lost response is idempotent.
			errorMsg = err instanceof Error ? err.message : 'Order failed. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{data.restaurant.name} · {data.table.label}</title>
</svelte:head>

<div class="min-h-dvh bg-sand-100">
	<!-- Header -->
	<header class="sticky top-0 z-40 border-b border-ink-600/10 bg-sand-50/95 pt-safe-header backdrop-blur">
		<div class="mx-auto max-w-6xl px-4 pt-3">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<BrandMark logoKey={data.brand.logoKey} size={32} />
						<h1 class="truncate font-display text-lg font-bold text-ink-800">{data.restaurant.name}</h1>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span class="hidden items-center gap-1 rounded-full bg-sand-200 px-3 py-1.5 text-xs font-semibold text-ink-700 sm:inline-flex">
						<Icon name="user" size={13} /> {data.table.label}
					</span>
					<CurrencySelect />
				</div>
			</div>

			<!-- Search -->
			<div class="relative mt-3">
				<Icon name="search" size={18} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
				<input
					type="search"
					bind:value={query}
					placeholder="Search dishes, drinks, ingredients…"
					aria-label="Search the menu"
					class="h-11 w-full rounded-full border border-ink-600/15 bg-sand-50 pl-10 pr-10 text-sm focus-visible:outline-2 focus-visible:outline-lagoon-500"
					data-testid="search-input"
				/>
				{#if query}
					<button
						type="button"
						onclick={() => (query = '')}
						class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 hover:bg-ink-600/8"
						aria-label="Clear search"
					>
						<Icon name="x" size={16} />
					</button>
				{/if}
			</div>

			<!-- mobile category chips -->
			<div class="lg:hidden">
				<CategoryNav categories={navCats} {activeId} variant="horizontal" onselect={scrollToCategory} />
			</div>
			{#if !query}
				<div class="hidden pb-3 lg:block"></div>
			{/if}
		</div>
	</header>

	<!-- Body -->
	<div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[190px_minmax(0,1fr)_330px]">
		<!-- desktop rail -->
		<aside class="hidden lg:block">
			<div class="sticky top-40">
				<CategoryNav categories={navCats} {activeId} variant="rail" onselect={scrollToCategory} />
			</div>
		</aside>

		<!-- menu content -->
		<main class="min-w-0">
			{#if query}
				<div class="mb-3 flex items-center justify-between">
					<p class="text-sm text-ink-600" data-testid="result-count">
						<span class="font-semibold text-ink-800">{filtered.length}</span>
						{filtered.length === 1 ? 'result' : 'results'} for “{query}”
					</p>
					<button type="button" class="text-sm font-semibold text-lagoon-700 hover:underline" onclick={() => (query = '')}>
						Clear
					</button>
				</div>
			{/if}

			{#if groups.length === 0}
				<div class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600/20 py-16 text-center">
					<span class="flex h-14 w-14 items-center justify-center rounded-full bg-sand-200 text-ink-400">
						<Icon name="search" size={26} />
					</span>
					<p class="font-display text-lg font-semibold text-ink-700">No dishes found</p>
					<p class="max-w-64 text-sm text-ink-400">Try a different search — a dish name, ingredient, or dietary label.</p>
					<button type="button" class="mt-1 rounded-full bg-lagoon-600 px-4 py-2 text-sm font-semibold text-sand-50" onclick={() => (query = '')}>
						Show all dishes
					</button>
				</div>
			{:else}
				<div class="flex flex-col gap-8">
					{#each groups as group (group.category.id)}
						<section id="cat-{group.category.id}" data-cat-section={group.category.id} class="scroll-mt-[164px] lg:scroll-mt-28">
							<div class="mb-3 border-b border-ink-600/10 pb-1.5">
								<h2 class="font-display text-xl font-bold text-ink-800">{group.category.name}</h2>
								{#if group.category.description}
									<p class="text-[13px] text-ink-400">{group.category.description}</p>
								{/if}
							</div>
							<div class="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
								{#each group.items as item (item.id)}
									<ItemCard {item} oncustomize={customize} onquickadd={quickAdd} />
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
			<div class="h-24 lg:h-4"></div>
		</main>

		<!-- desktop order summary -->
		<aside class="hidden lg:block">
			<div class="sticky top-40 flex max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-2xl border border-ink-600/10 bg-sand-50 shadow-sm">
				<div class="flex items-center justify-between border-b border-ink-600/10 px-4 py-3">
					<h2 class="font-display text-lg font-bold text-ink-800">Your order</h2>
					<span class="rounded-full bg-lagoon-100 px-2 py-0.5 text-xs font-bold text-lagoon-800">{cart.count}</span>
				</div>
				<CartPanel onedit={editLine} oncheckout={checkout} {submitting} />
			</div>
		</aside>
	</div>

	<!-- mobile floating cart bar -->
	{#if cart.count > 0}
		<div class="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600/10 bg-sand-50/95 px-4 py-2.5 pb-safe-4 backdrop-blur lg:hidden">
			<button
				type="button"
				onclick={() => (cartSheetOpen = true)}
				class="flex min-h-12 w-full items-center justify-between rounded-full bg-lagoon-600 px-5 text-sand-50"
				data-testid="view-order-bar"
			>
				<span class="flex items-center gap-2 font-semibold">
					<span class="flex h-6 min-w-6 items-center justify-center rounded-full bg-sand-50/25 px-1.5 text-sm">{cart.count}</span>
					View order
				</span>
				<span class="font-display font-bold">{currency.format(cart.subtotalBase)}</span>
			</button>
		</div>
	{/if}
</div>

<!-- mobile cart sheet -->
<Dialog bind:open={cartSheetOpen} onclose={() => (cartSheetOpen = false)} size="md" title="Your order">
	<div class="flex items-center justify-between border-b border-ink-600/10 px-4 py-3">
		<h2 class="font-display text-lg font-bold text-ink-800">Your order</h2>
		<button type="button" onclick={() => (cartSheetOpen = false)} class="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-600/8" aria-label="Close">
			<Icon name="x" size={18} />
		</button>
	</div>
	<div class="h-[70dvh]">
		<CartPanel onedit={editLine} oncheckout={checkout} {submitting} />
	</div>
</Dialog>

<!-- error toast -->
{#if errorMsg}
	<div class="fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-sm items-start gap-2 rounded-xl bg-coral-600 px-4 py-3 text-sm text-sand-50 shadow-lg lg:bottom-6" role="alert" data-testid="order-error">
		<Icon name="alert" size={18} />
		<span class="flex-1">{errorMsg}</span>
		<button type="button" onclick={() => (errorMsg = '')} aria-label="Dismiss"><Icon name="x" size={16} /></button>
	</div>
{/if}

{#if wizardItem}
	<CustomizeDialog
		bind:open={wizardOpen}
		item={wizardItem}
		editUid={wizardEditUid}
		oncommit={onCommit}
		onupdate={onUpdate}
		onclose={() => (wizardOpen = false)}
	/>
{/if}

<BeveragePromptDialog
	bind:open={beverageOpen}
	heading={data.beverage.heading}
	body={data.beverage.body}
	skipLabel={data.beverage.skipLabel}
	drinks={drinksForPrompt}
	{showDrinks}
	{showWater}
	{waterItem}
	onsend={beverageSend}
	onclose={beverageCancel}
/>

<ConfirmationDialog
	bind:open={confirmationOpen}
	orderNumber={confirmation?.number ?? ''}
	tableLabel={confirmation?.table ?? ''}
	onclose={() => (confirmationOpen = false)}
/>
