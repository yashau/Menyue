<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { MenuItem, Category } from '$lib/types';
	import { formatBaseMinor } from '$lib/money';
	import { itemImage } from '$lib/image';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import ImageCropper from '$lib/components/ui/ImageCropper.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';

	let { data } = $props();

	const FLIP = 180;
	const money = (m: number) => formatBaseMinor(m, data.base);
	const priceMajor = (m: number) => (m / Math.pow(10, data.basePrecision)).toFixed(data.basePrecision);

	type Group = { id: number; category: Category; items: MenuItem[] };

	function buildTree(categories: Category[], items: MenuItem[]) {
		const sortedItems = [...items].sort((a, b) => a.displayOrder - b.displayOrder);
		const byCat = new Map<number, MenuItem[]>();
		for (const c of categories) byCat.set(c.id, []);
		const uncat: MenuItem[] = [];
		for (const it of sortedItems) {
			if (it.categoryId != null && byCat.has(it.categoryId)) byCat.get(it.categoryId)!.push(it);
			else uncat.push(it);
		}
		const sortedCats = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
		return {
			groups: sortedCats.map((c) => ({ id: c.id, category: c, items: byCat.get(c.id)! })),
			uncat
		};
	}

	let groups = $state<Group[]>([]);
	let uncatItems = $state<MenuItem[]>([]);
	// Server data is the authoritative order; rebuild the tree whenever it
	// changes (item saved/toggled/deleted, or a fresh load). Reordering itself
	// persists via fetch and does NOT invalidate, so this never clobbers a drag.
	$effect(() => {
		const t = buildTree(data.categories, data.items);
		groups = t.groups;
		uncatItems = t.uncat;
	});

	// ---- search (flat results; dragging is disabled while filtering) ----
	let query = $state('');
	const searching = $derived(query.trim().length > 0);
	const results = $derived(
		searching
			? data.items
					.filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase()))
					.sort((a, b) => a.name.localeCompare(b.name))
			: []
	);
	const catName = $derived(new Map(data.categories.map((c) => [c.id, c.name])));

	// ---- drag & drop ----
	let catDragDisabled = $state(true);
	let itemDragDisabled = $state(true);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(persist, 200);
	}
	async function persist() {
		const structure = [
			...groups.map((g) => ({ categoryId: g.category.id, itemIds: g.items.map((i) => i.id) })),
			...(uncatItems.length ? [{ categoryId: null, itemIds: uncatItems.map((i) => i.id) }] : [])
		];
		const fd = new FormData();
		fd.set('csrf', data.csrf);
		fd.set('structure', JSON.stringify(structure));
		try {
			const res = await fetch('?/reorder', { method: 'POST', body: fd });
			if (!res.ok) throw new Error();
		} catch {
			toast.error('Could not save the new order');
		}
	}

	function catConsider(e: CustomEvent<DndEvent<Group>>) {
		groups = e.detail.items;
	}
	function catFinalize(e: CustomEvent<DndEvent<Group>>) {
		groups = e.detail.items;
		catDragDisabled = true;
		scheduleSave();
	}
	function itemConsider(group: Group, e: CustomEvent<DndEvent<MenuItem>>) {
		group.items = e.detail.items;
	}
	function itemFinalize(group: Group, e: CustomEvent<DndEvent<MenuItem>>) {
		group.items = e.detail.items;
		itemDragDisabled = true;
		scheduleSave();
	}
	function uncatConsider(e: CustomEvent<DndEvent<MenuItem>>) {
		uncatItems = e.detail.items;
	}
	function uncatFinalize(e: CustomEvent<DndEvent<MenuItem>>) {
		uncatItems = e.detail.items;
		itemDragDisabled = true;
		scheduleSave();
	}

	// ---- item dialog ----
	let editOpen = $state(false);
	let editing = $state<MenuItem | null>(null);
	let creating = $state(false);
	let cropperOpen = $state(false);
	let editImageKey = $state<string | null>(null);
	let presetCat = $state<number | null>(null);

	let fCategory = $state('');
	let fAvailability = $state('available');
	let fLabelKind = $state('info');
	let fEnabled = $state(true);
	let fListed = $state(true);
	let fBeverage = $state(false);
	let fSuggestTarget = $state('');

	$effect(() => {
		if (!editOpen) return;
		fCategory = String(editing?.categoryId ?? presetCat ?? data.categories[0]?.id ?? '');
		fAvailability = editing?.availability === 'unavailable' ? 'unavailable' : 'available';
		fLabelKind = editing?.labelKind ?? 'info';
		fEnabled = editing ? editing.enabled : true;
		fListed = editing ? editing.listed : true;
		fBeverage = editing?.isBeverage ?? false;
		const firstTarget = data.items.find((i) => i.id !== editing?.id);
		fSuggestTarget = firstTarget ? String(firstTarget.id) : '';
	});

	const previewSrc = $derived(
		editImageKey
			? `/media/${editImageKey}`
			: editing
				? `/img/${editing.imageSeed}?kind=${editing.isBeverage ? 'drink' : 'food'}`
				: '/img/new-dish?kind=food'
	);

	function openCreate(categoryId: number | null = null) {
		editing = null;
		creating = true;
		editImageKey = null;
		presetCat = categoryId;
		editOpen = true;
	}
	function openEdit(it: MenuItem) {
		editing = it;
		creating = false;
		editImageKey = it.imageKey;
		presetCat = null;
		editOpen = true;
	}

	async function uploadPhoto(blob: Blob) {
		const res = await fetch('/admin/media', {
			method: 'POST',
			headers: { 'content-type': blob.type || 'image/webp', 'x-csrf': data.csrf },
			body: blob
		});
		if (!res.ok) {
			toast.error('Photo upload failed');
			return;
		}
		const body = (await res.json()) as { key: string };
		editImageKey = body.key;
		toast.success('Photo uploaded');
	}

	const currentSuggestions = $derived(
		editing ? data.suggestions.filter((s) => s.source_item_id === editing!.id) : []
	);
	const suggestTargetLabel = $derived(
		data.items.find((i) => String(i.id) === fSuggestTarget)?.name ?? 'Select item'
	);

	// ---- category dialog ----
	let catOpen = $state(false);
	let editingCat = $state<Category | null>(null);
	let fCatEnabled = $state(true);
	$effect(() => {
		if (catOpen) fCatEnabled = editingCat ? editingCat.enabled : true;
	});
	function openNewCat() {
		editingCat = null;
		catOpen = true;
	}
	function openEditCat(c: Category) {
		editingCat = c;
		catOpen = true;
	}
</script>

<svelte:head><title>Menu · Menyue admin</title></svelte:head>

{#snippet itemRow(it: MenuItem, draggable: boolean)}
	<div class="flex items-center gap-2 rounded-lg border border-border bg-background p-2" data-testid="admin-item-row">
		{#if draggable}
			<span
				class="flex h-8 w-5 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
				aria-label="Drag to reorder"
				role="button"
				tabindex="0"
				onpointerdown={() => (itemDragDisabled = false)}
				onpointerup={() => (itemDragDisabled = true)}
			>
				<GripVertical class="size-4" />
			</span>
		{/if}
		<img
			src={itemImage(it)}
			alt=""
			class="size-10 shrink-0 rounded-md object-cover {it.enabled ? '' : 'opacity-40 grayscale'}"
		/>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="truncate text-sm font-medium">{it.name}</span>
				{#if !it.enabled}<Badge variant="secondary">disabled</Badge>{/if}
				{#if it.enabled && !it.listed}<Badge variant="outline">suggestion-only</Badge>{/if}
				{#if it.availability === 'unavailable'}<Badge variant="destructive">unavailable</Badge>{/if}
			</div>
			<div class="text-xs text-muted-foreground">
				{money(it.basePrice)}{it.optionGroups.length ? ` · ${it.optionGroups.length} option group(s)` : ''}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<form method="POST" action="?/toggleEnabled" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<input type="hidden" name="csrf" value={data.csrf} />
				<input type="hidden" name="id" value={it.id} />
				<input type="hidden" name="value" value={it.enabled ? '0' : '1'} />
				<Button type="submit" variant="outline" size="sm">{it.enabled ? 'Disable' : 'Enable'}</Button>
			</form>
			<Button variant="ghost" size="icon" onclick={() => openEdit(it)} aria-label="Edit {it.name}">
				<Pencil />
			</Button>
		</div>
	</div>
{/snippet}

<div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Menu items</h1>
			<p class="text-sm text-muted-foreground">
				{data.items.length} items · {data.categories.length} categories · drag to reorder
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={openNewCat}><FolderPlus /> New category</Button>
			<Button onclick={() => openCreate()}><Plus /> New item</Button>
		</div>
	</header>

	<div class="relative mb-4">
		<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input bind:value={query} placeholder="Search all items…" class="pl-9" />
	</div>

	{#if searching}
		<!-- flat search results (no reordering while filtering) -->
		<div class="flex flex-col gap-2">
			{#each results as it (it.id)}
				<div class="flex items-center gap-1">
					<span class="w-24 shrink-0 truncate text-xs text-muted-foreground">
						{it.categoryId != null ? (catName.get(it.categoryId) ?? 'Uncategorised') : 'Uncategorised'}
					</span>
					<div class="min-w-0 flex-1">{@render itemRow(it, false)}</div>
				</div>
			{:else}
				<div class="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
					No items match "{query}".
				</div>
			{/each}
		</div>
	{:else}
		<!-- draggable category → item tree -->
		<div
			class="flex flex-col gap-3"
			use:dndzone={{ items: groups, type: 'category', dragDisabled: catDragDisabled, flipDurationMs: FLIP, dropTargetStyle: {} }}
			onconsider={catConsider}
			onfinalize={catFinalize}
		>
			{#each groups as group (group.id)}
				<div animate:flip={{ duration: FLIP }}>
					<Card.Root class="gap-0 overflow-visible py-0">
						<div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
							<span
								class="flex h-8 w-5 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
								aria-label="Drag category"
								role="button"
								tabindex="0"
								onpointerdown={() => (catDragDisabled = false)}
								onpointerup={() => (catDragDisabled = true)}
							>
								<GripVertical class="size-4" />
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate font-semibold">{group.category.name}</span>
									{#if !group.category.enabled}<Badge variant="secondary">hidden</Badge>{/if}
									<Badge variant="outline">{group.items.length}</Badge>
								</div>
								{#if group.category.description}
									<div class="truncate text-xs text-muted-foreground">{group.category.description}</div>
								{/if}
							</div>
							<Button variant="ghost" size="sm" onclick={() => openCreate(group.category.id)}><Plus /> Item</Button>
							<Button variant="ghost" size="icon" onclick={() => openEditCat(group.category)} aria-label="Edit {group.category.name}">
								<Pencil />
							</Button>
							<form method="POST" action="?/removeCategory" use:enhance={() => async ({ update }) => update({ reset: false })}>
								<input type="hidden" name="csrf" value={data.csrf} />
								<input type="hidden" name="id" value={group.category.id} />
								<Button type="submit" variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive" aria-label="Delete {group.category.name}">
									<Trash2 />
								</Button>
							</form>
						</div>
						<div
							class="flex min-h-[52px] flex-col gap-2 p-2"
							use:dndzone={{ items: group.items, type: 'item', dragDisabled: itemDragDisabled, flipDurationMs: FLIP, dropTargetStyle: {} }}
							onconsider={(e) => itemConsider(group, e)}
							onfinalize={(e) => itemFinalize(group, e)}
						>
							{#each group.items as it (it.id)}
								<div animate:flip={{ duration: FLIP }}>
									{@render itemRow(it, true)}
								</div>
							{/each}
						</div>
						{#if group.items.length === 0}
							<p class="px-3 pb-3 text-center text-xs text-muted-foreground">No items yet — drag one here or add one.</p>
						{/if}
					</Card.Root>
				</div>
			{/each}
		</div>

		{#if uncatItems.length}
			<Card.Root class="mt-3 gap-0 overflow-visible py-0">
				<div class="border-b border-border px-3 py-2.5">
					<span class="font-semibold text-muted-foreground">Uncategorised</span>
					<span class="ml-1 text-xs text-muted-foreground">— not shown to guests until placed in a category</span>
				</div>
				<div
					class="flex min-h-[52px] flex-col gap-2 p-2"
					use:dndzone={{ items: uncatItems, type: 'item', dragDisabled: itemDragDisabled, flipDurationMs: FLIP, dropTargetStyle: {} }}
					onconsider={uncatConsider}
					onfinalize={uncatFinalize}
				>
					{#each uncatItems as it (it.id)}
						<div animate:flip={{ duration: FLIP }}>
							{@render itemRow(it, true)}
						</div>
					{/each}
				</div>
			</Card.Root>
		{/if}
	{/if}
</div>

<!-- Item dialog -->
<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<Dialog.Header class="border-b border-border p-4">
			<Dialog.Title>{creating ? 'New item' : `Edit ${editing?.name}`}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto p-4">
			<form
				method="POST"
				action="?/save"
				id="itemForm"
				use:enhance={() => async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						toast.success('Saved');
						editOpen = false;
					}
				}}
				class="flex flex-col gap-4"
			>
				<input type="hidden" name="csrf" value={data.csrf} />
				{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}

				<div class="grid gap-1.5">
					<Label for="it-name">Name</Label>
					<Input id="it-name" name="name" required value={editing?.name ?? ''} />
				</div>

				<div class="grid gap-1.5">
					<Label for="it-desc">Description</Label>
					<Textarea id="it-desc" name="description" rows={2} value={editing?.description ?? ''} />
				</div>

				<div class="grid gap-1.5">
					<Label>Photo</Label>
					<div class="flex items-center gap-3">
						<div class="h-16 w-[85px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
							<img src={previewSrc} alt="" class="h-full w-full object-cover" />
						</div>
						<div class="flex flex-col items-start gap-1.5">
							<Button type="button" variant="secondary" size="sm" onclick={() => (cropperOpen = true)}>
								<Plus /> {editImageKey ? 'Change photo' : 'Upload photo'}
							</Button>
							{#if editImageKey}
								<Button type="button" variant="link" size="sm" class="h-auto p-0 text-destructive" onclick={() => (editImageKey = null)}>
									Remove — use illustration
								</Button>
							{:else}
								<span class="text-xs text-muted-foreground">Using the illustrated fallback</span>
							{/if}
						</div>
					</div>
					<input type="hidden" name="imageKey" value={editImageKey ?? ''} />
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label for="it-price">Price ({data.base.code})</Label>
						<Input id="it-price" name="price" type="number" step="0.01" min="0" value={editing ? priceMajor(editing.basePrice) : '0.00'} />
					</div>
					<div class="grid gap-1.5">
						<Label>Category</Label>
						<Select.Root type="single" name="categoryId" bind:value={fCategory}>
							<Select.Trigger class="w-full">{catName.get(Number(fCategory)) ?? 'Select'}</Select.Trigger>
							<Select.Content>
								{#each data.categories as c (c.id)}
									<Select.Item value={String(c.id)} label={c.name}>{c.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label>Availability</Label>
						<Select.Root type="single" name="availability" bind:value={fAvailability}>
							<Select.Trigger class="w-full capitalize">{fAvailability}</Select.Trigger>
							<Select.Content>
								<Select.Item value="available" label="Available">Available</Select.Item>
								<Select.Item value="unavailable" label="Unavailable">Unavailable</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					<div class="grid gap-1.5">
						<Label for="it-label">Label (optional)</Label>
						<Input id="it-label" name="label" value={editing?.label ?? ''} placeholder="e.g. Chef's pick" />
					</div>
				</div>

				<div class="grid gap-1.5">
					<Label>Label style</Label>
					<Select.Root type="single" name="labelKind" bind:value={fLabelKind}>
						<Select.Trigger class="w-full capitalize">{fLabelKind}</Select.Trigger>
						<Select.Content>
							<Select.Item value="info" label="Info">Info</Select.Item>
							<Select.Item value="promo" label="Promo">Promo</Select.Item>
							<Select.Item value="new" label="New">New</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-1.5">
					<Label for="it-allergens">Allergens (comma separated)</Label>
					<Input id="it-allergens" name="allergens" value={editing?.allergens.join(', ') ?? ''} />
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label for="it-dietary">Dietary (comma separated)</Label>
						<Input id="it-dietary" name="dietary" value={editing?.dietary.join(', ') ?? ''} />
					</div>
					<div class="grid gap-1.5">
						<Label for="it-tags">Tags (comma separated)</Label>
						<Input id="it-tags" name="tags" value={editing?.tags.join(', ') ?? ''} />
					</div>
				</div>

				<div class="flex flex-wrap gap-6">
					<div class="flex items-center gap-2">
						<Switch id="it-enabled" name="enabled" value="on" bind:checked={fEnabled} />
						<Label for="it-enabled">Enabled</Label>
					</div>
					<div class="flex items-center gap-2">
						<Switch id="it-listed" name="listed" value="on" bind:checked={fListed} />
						<Label for="it-listed">Show in menu</Label>
					</div>
					<div class="flex items-center gap-2">
						<Switch id="it-bev" name="isBeverage" value="on" bind:checked={fBeverage} />
						<Label for="it-bev">Beverage</Label>
					</div>
				</div>
				<p class="-mt-1 text-xs text-muted-foreground">
					Turn off "Show in menu" for add-ons that should only appear as suggestions (e.g. poppadums) — still
					orderable, just hidden from browsing.
				</p>
			</form>

			{#if editing}
				{#if editing.optionGroups.length}
					<div class="mt-4 rounded-lg bg-muted p-3">
						<div class="mb-1 text-xs font-medium text-muted-foreground">Option groups</div>
						{#each editing.optionGroups as g (g.name)}
							<div class="text-sm">
								<span class="font-medium">{g.name}</span>
								<span class="text-xs text-muted-foreground">
									· {g.selectionType}{g.required ? ' · required' : ''} · {g.choices.length} choices</span
								>
							</div>
						{/each}
					</div>
				{/if}

				<div class="mt-4 rounded-lg bg-muted p-3">
					<div class="mb-2 text-xs font-medium text-muted-foreground">Suggested with this item</div>
					{#if currentSuggestions.length}
						<ul class="mb-2 flex flex-col gap-1">
							{#each currentSuggestions as s (s.id)}
								<li class="flex items-center justify-between gap-2 text-sm">
									<span>{s.target_name}</span>
									<form method="POST" action="?/removeSuggestion" use:enhance={() => async ({ update }) => update({ reset: false })}>
										<input type="hidden" name="csrf" value={data.csrf} />
										<input type="hidden" name="suggestionId" value={s.id} />
										<Button type="submit" variant="link" size="sm" class="h-auto p-0 text-destructive">Remove</Button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mb-2 text-xs text-muted-foreground">No suggestions yet.</p>
					{/if}
					<form method="POST" action="?/addSuggestion" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex gap-2">
						<input type="hidden" name="csrf" value={data.csrf} />
						<input type="hidden" name="sourceId" value={editing.id} />
						<Select.Root type="single" name="targetId" bind:value={fSuggestTarget}>
							<Select.Trigger class="h-9 flex-1">{suggestTargetLabel}</Select.Trigger>
							<Select.Content>
								{#each data.items.filter((i) => i.id !== editing!.id) as opt (opt.id)}
									<Select.Item value={String(opt.id)} label={opt.name}>{opt.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Button type="submit" variant="secondary">Add</Button>
					</form>
				</div>
			{/if}
		</div>

		<Dialog.Footer class="m-0 flex-row items-center justify-between border-t border-border bg-muted/40 p-4 sm:justify-between">
			{#if editing}
				<form
					method="POST"
					action="?/remove"
					use:enhance={() => async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') {
							toast.success('Item deleted');
							editOpen = false;
						}
					}}
				>
					<input type="hidden" name="csrf" value={data.csrf} />
					<input type="hidden" name="id" value={editing.id} />
					<Button type="submit" variant="destructive">Delete</Button>
				</form>
			{:else}
				<span></span>
			{/if}
			<Button type="submit" form="itemForm">Save item</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Category dialog -->
<Dialog.Root bind:open={catOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editingCat ? 'Edit category' : 'New category'}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/saveCategory"
			id="catForm"
			use:enhance={() => async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') catOpen = false;
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="csrf" value={data.csrf} />
			{#if editingCat}<input type="hidden" name="id" value={editingCat.id} />{/if}
			<div class="grid gap-1.5">
				<Label for="cat-name">Name</Label>
				<Input id="cat-name" name="name" required value={editingCat?.name ?? ''} />
			</div>
			<div class="grid gap-1.5">
				<Label for="cat-desc">Description</Label>
				<Input id="cat-desc" name="description" value={editingCat?.description ?? ''} />
			</div>
			<div class="flex items-center gap-2">
				<Switch id="cat-enabled" name="enabled" value="on" bind:checked={fCatEnabled} />
				<Label for="cat-enabled">Visible to guests</Label>
			</div>
			<p class="-mt-1 text-xs text-muted-foreground">Reorder categories by dragging them on the menu.</p>
		</form>
		<Dialog.Footer class="flex-row items-center justify-between sm:justify-between">
			{#if editingCat}
				<form
					method="POST"
					action="?/removeCategory"
					use:enhance={() => async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') catOpen = false;
					}}
				>
					<input type="hidden" name="csrf" value={data.csrf} />
					<input type="hidden" name="id" value={editingCat.id} />
					<Button type="submit" variant="destructive">Delete</Button>
				</form>
			{:else}<span></span>{/if}
			<Button type="submit" form="catForm">Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ImageCropper bind:open={cropperOpen} onclose={() => (cropperOpen = false)} onapply={uploadPhoto} />
