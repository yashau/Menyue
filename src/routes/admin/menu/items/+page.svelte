<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { enhance } from '$app/forms';
	import { matchesAdminItemSearch } from '$lib/admin-menu';
	import { MENU_IMAGE_MAX_BYTES, MENU_IMAGE_ASPECTS, menuImageCrop, type MenuImageAspect } from '$lib/menu-image';
	import { tick } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let search = $state('');
	let categoryFilter = $state('all');
	let statusFilter = $state('all');
	let editorOpen = $state(false);
	let selectedItemId = $state<string | null>(null);
	let searchInput = $state<HTMLInputElement | undefined>(undefined);
	let saveItemButton = $state<HTMLButtonElement | undefined>(undefined);
	let photoInput = $state<HTMLInputElement | undefined>(undefined);
	let sourcePhoto = $state<File | null>(null);
	let sourcePhotoUrl = $state<string | null>(null);
	let preparedPhotoUrl = $state<string | null>(null);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let cropAspect = $state<MenuImageAspect>('4:3');
	let preparedAspect = $state<MenuImageAspect>('4:3');
	let cropX = $state(0);
	let cropY = $state(0);
	let rotation = $state(0);
	let preparingPhoto = $state(false);
	let cropDirty = $state(false);
	let photoMessage = $state('');

	const value = (input: unknown) => String(input ?? '');
	const checked = (input: unknown) => Number(input) === 1;
	const money = (minor: unknown) => (Number(minor) / 100).toFixed(2);
	const selectedItem = $derived(data.items.find((item) => value(item.id) === selectedItemId));
	const visibleItems = $derived(
		data.items.filter((item) => matchesAdminItemSearch(item, search, categoryFilter, statusFilter)),
	);
	const reorderLocked = $derived(Boolean(search.trim() || statusFilter !== 'all'));

	function openEditor(itemId: string | null = null) {
		selectedItemId = itemId;
		editorOpen = true;
	}

	function clearFilters() {
		search = '';
		categoryFilter = 'all';
		statusFilter = 'all';
		searchInput?.focus();
	}

	function preserveEditorOnSave() {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			editorOpen = true;
			await tick();
			saveItemButton?.focus();
		};
	}

	function confirmDestructive(event: SubmitEvent, message: string) {
		if (!window.confirm(message)) event.preventDefault();
	}

	function confirmPromotionRemoval(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		if (new FormData(form).get('clear') === 'on') {
			confirmDestructive(event, 'Remove this promotion? This cannot be undone.');
		}
	}

	function resetPhoto(clearMessage = true) {
		if (sourcePhotoUrl) URL.revokeObjectURL(sourcePhotoUrl);
		if (preparedPhotoUrl) URL.revokeObjectURL(preparedPhotoUrl);
		sourcePhoto = null; sourcePhotoUrl = null; preparedPhotoUrl = null;
		sourceWidth = 0; sourceHeight = 0; cropDirty = false; if (clearMessage) photoMessage = '';
		if (photoInput) photoInput.value = '';
	}

	async function loadPhoto(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		resetPhoto();
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MENU_IMAGE_MAX_BYTES) {
			photoMessage = 'Choose a JPEG, PNG or WebP smaller than 5 MB.';
			return;
		}
		sourcePhoto = file;
		sourcePhotoUrl = URL.createObjectURL(file);
		const image = new Image(); image.src = sourcePhotoUrl;
		try { await image.decode(); sourceWidth = image.naturalWidth; sourceHeight = image.naturalHeight; await preparePhoto(); }
		catch { resetPhoto(false); photoMessage = 'This image could not be prepared. Choose a different file.'; }
	}

	async function preparePhoto() {
		if (!sourcePhoto || !sourcePhotoUrl || !sourceWidth || !sourceHeight || !photoInput) return;
		preparingPhoto = true; photoMessage = '';
		try {
			const image = new Image(); image.src = sourcePhotoUrl; await image.decode();
			const sideways = rotation % 180 !== 0;
			const rotatedWidth = sideways ? sourceHeight : sourceWidth, rotatedHeight = sideways ? sourceWidth : sourceHeight;
			const rotated = document.createElement('canvas'); rotated.width = rotatedWidth; rotated.height = rotatedHeight;
			const context = rotated.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.');
			context.translate(rotatedWidth / 2, rotatedHeight / 2); context.rotate((rotation * Math.PI) / 180);
			context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);
			const crop = menuImageCrop(rotatedWidth, rotatedHeight, cropAspect, cropX / 100, cropY / 100);
			const canvas = document.createElement('canvas'); canvas.width = crop.width; canvas.height = crop.height;
			const output = canvas.getContext('2d'); if (!output) throw new Error('Canvas is unavailable.');
			output.drawImage(rotated, crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight, 0, 0, crop.width, crop.height);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
			if (!blob) throw new Error('Image encoding failed.');
			const prepared = new File([blob], `${sourcePhoto.name.replace(/\.[^.]+$/, '') || 'menu-image'}.jpg`, { type: 'image/jpeg' });
			const transfer = new DataTransfer(); transfer.items.add(prepared); photoInput.files = transfer.files;
			if (preparedPhotoUrl) URL.revokeObjectURL(preparedPhotoUrl);
			preparedPhotoUrl = URL.createObjectURL(prepared);
			preparedAspect = cropAspect;
			cropDirty = false;
			photoMessage = `Prepared ${crop.width} × ${crop.height}px JPEG (${Math.ceil(prepared.size / 1024)} KB).`;
		} catch (error) { photoMessage = error instanceof Error ? error.message : 'Image preparation failed.'; }
		finally { preparingPhoto = false; }
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-3xl font-semibold tracking-tight">Menu items</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Create, price, publish and arrange every menu item.
			</p>
		</div>
		<Button type="button" onclick={() => openEditor()}>Create menu item</Button>
	</header>

	<section
		class="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]"
		aria-label="Filter menu items"
	>
		<label class="grid gap-1 text-sm font-medium">
			Search items
			<Input bind:ref={searchInput} bind:value={search} placeholder="Name, description, category or tag" />
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Category
			<Select.Root type="single" bind:value={categoryFilter}>
				<Select.Trigger aria-label="Filter by category" class="w-full"
					>{categoryFilter === 'all'
						? 'All categories'
						: value(
								data.categories.find((category) => value(category.id) === categoryFilter)?.name,
							)}</Select.Trigger
				>
				<Select.Content>
					<Select.Item value="all">All categories</Select.Item>
					{#each data.categories as category}
						<Select.Item value={value(category.id)}>{value(category.name)}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</label>
		<label class="grid gap-1 text-sm font-medium">
			Status
			<Select.Root type="single" bind:value={statusFilter}>
				<Select.Trigger aria-label="Filter by status" class="w-full"
					>{statusFilter === 'all'
						? 'All statuses'
						: statusFilter.replaceAll('_', ' ')}</Select.Trigger
				>
				<Select.Content>
					<Select.Item value="all">All statuses</Select.Item>
					<Select.Item value="enabled">Enabled</Select.Item>
					<Select.Item value="disabled">Disabled</Select.Item>
					<Select.Item value="available">Available</Select.Item>
					<Select.Item value="sold_out">Sold out</Select.Item>
					<Select.Item value="browse">Shown in browsing</Select.Item>
					<Select.Item value="suggestion_only">Suggestion only</Select.Item>
				</Select.Content>
			</Select.Root>
		</label>
		<div class="flex items-end">
			<Button type="button" variant="outline" onclick={clearFilters}>Clear filters</Button>
		</div>
	</section>

	<p class="text-sm text-muted-foreground" aria-live="polite">
		{visibleItems.length} of {data.items.length} menu items
	</p>
	{#if reorderLocked}
		<p class="text-sm text-muted-foreground" role="status">
			Clear search and status filters to reorder items in their canonical category order.
		</p>
	{/if}

	<section class="grid gap-3" aria-label="Menu item summaries">
		{#each visibleItems as item (value(item.id))}
			{@const itemId = value(item.id)}
			{@const hasPromotion = data.promotions.some(
				(row) => value(row.item_id) === itemId && checked(row.enabled),
			)}
			{@const optionCount = data.groups.filter((row) => value(row.item_id) === itemId).length}
			{@const suggestionCount = data.suggestions.filter(
				(row) => value(row.item_id) === itemId,
			).length}
			<article
				class="grid gap-3 rounded-lg border border-l-4 border-l-primary/60 bg-card p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center"
			>
				{#if item.photo_asset_id}
					<img
						class="h-20 w-full rounded-md object-cover sm:w-20"
						src={`/media/${value(item.photo_asset_id)}`}
						alt={value(item.name)}
					/>
				{:else}
					<div
						class="flex h-20 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
					>
						No photo
					</div>
				{/if}
				<div class="min-w-0 space-y-2">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="truncate font-semibold">{value(item.name)}</h2>
						<Badge variant="secondary">{value(item.category)}</Badge>
						<Badge variant={checked(item.enabled) ? 'default' : 'outline'}
							>{checked(item.enabled) ? 'Enabled' : 'Disabled'}</Badge
						>
						<Badge variant={value(item.availability) === 'sold_out' ? 'destructive' : 'outline'}
							>{value(item.availability) === 'sold_out' ? 'Sold out' : 'Available'}</Badge
						>
						{#if value(item.discoverability) === 'suggestion_only'}<Badge variant="secondary">Suggestion only</Badge>{/if}
					</div>
					<p class="text-sm text-muted-foreground">
						{value(item.code)} · {money(item.base_price_minor)}
					</p>
					<div class="flex flex-wrap gap-1.5 text-xs">
						<Badge variant={hasPromotion ? 'default' : 'outline'}
							>{hasPromotion ? 'Promotion active' : 'No promotion'}</Badge
						>
						<Badge variant="outline"
							>{optionCount} option {optionCount === 1 ? 'group' : 'groups'}</Badge
						>
						<Badge variant="outline"
							>{suggestionCount} suggestion {suggestionCount === 1 ? '' : 's'}</Badge
						>
					</div>
				</div>
				<div class="flex flex-wrap gap-2 sm:justify-end">
					<form method="POST" action="?/availability">
						<input type="hidden" name="id" value={itemId} />
						<input type="hidden" name="availability" value={value(item.availability) === 'sold_out' ? 'available' : 'sold_out'} />
						<Button type="submit" size="sm" variant={value(item.availability) === 'sold_out' ? 'outline' : 'secondary'}>{value(item.availability) === 'sold_out' ? 'Mark available' : 'Mark sold out'}</Button>
					</form>
					<form method="POST" action="?/move">
						<input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="direction" value="up" />
						<Button type="submit" size="sm" variant="outline" disabled={reorderLocked} aria-label={`Move ${value(item.name)} up within ${value(item.category)}`}>Move up</Button>
					</form>
					<form method="POST" action="?/move">
						<input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="direction" value="down" />
						<Button type="submit" size="sm" variant="outline" disabled={reorderLocked} aria-label={`Move ${value(item.name)} down within ${value(item.category)}`}>Move down</Button>
					</form>
					<Button type="button" variant="outline" onclick={() => openEditor(itemId)}>Edit</Button>
				</div>
			</article>
		{:else}
			<div class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No menu items match these filters.
			</div>
		{/each}
	</section>
</div>

{#if editorOpen}
	<Dialog.Root bind:open={editorOpen}>
		<Dialog.Content
			class="max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] gap-4 overflow-y-auto rounded-lg p-4 sm:max-w-3xl sm:p-6"
		>
			<Dialog.Header class="pr-9">
				<Dialog.Title
					>{selectedItem ? `Edit ${value(selectedItem.name)}` : 'Create menu item'}</Dialog.Title
				>
				<Dialog.Description>
					{selectedItem
						? 'Changes are limited to this menu item.'
						: 'Create the item first, then add promotions, options and suggestions.'}
				</Dialog.Description>
			</Dialog.Header>

			<details class="rounded-md border p-3" open>
				<summary class="cursor-pointer font-medium">Basics</summary>
				<form
					method="POST"
					action="?/save"
					enctype="multipart/form-data"
					use:enhance={preserveEditorOnSave}
					class="mt-4 grid gap-3 sm:grid-cols-2"
				>
					{#if selectedItem}<input type="hidden" name="id" value={value(selectedItem.id)} />{/if}
					<label class="grid gap-1"
						>Category
						<Select.Root
							type="single"
							name="category"
							value={selectedItem ? value(selectedItem.category_id) : undefined}
							required
						>
							<Select.Trigger aria-label="Category" class="w-full"
								>{selectedItem ? value(selectedItem.category) : 'Select a category'}</Select.Trigger
							>
							<Select.Content
								>{#each data.categories as category}<Select.Item value={value(category.id)}
										>{value(category.name)}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</label>
					<label class="grid gap-1"
						>Item code<Input
							name="code"
							value={selectedItem ? value(selectedItem.code) : ''}
							required
						/></label
					>
					<label class="grid gap-1"
						>Name<Input
							name="name"
							value={selectedItem ? value(selectedItem.name) : ''}
							required
						/></label
					>
					<label class="grid gap-1"
						>Price<Input
							name="price"
							type="number"
							min="0"
							step="0.01"
							value={selectedItem ? money(selectedItem.base_price_minor) : ''}
							required
						/></label
					>
					<label class="grid gap-1 sm:col-span-2"
						>Description<Textarea
							name="description"
							value={selectedItem ? value(selectedItem.description) : ''}
						/></label
					>
					<label class="grid gap-1 sm:col-span-2"
						>Allergy note<Textarea
							name="allergy"
							value={selectedItem ? value(selectedItem.allergy_note) : ''}
						/></label
					>
					<div class="grid gap-3 sm:col-span-2 rounded-md border p-3">
						<label class="grid gap-1"
							>{selectedItem ? 'Replace photo' : 'Photo'}<Input
								bind:ref={photoInput}
							name="photo"
							type="file"
							accept="image/png,image/jpeg,image/webp"
								onchange={loadPhoto}
							/></label>
						<p class="text-xs text-muted-foreground">Prepare a menu-card image before upload. The server independently verifies the image type and 5 MB limit.</p>
						{#if sourcePhoto}
							<div class="grid gap-3 sm:grid-cols-2">
								<fieldset class="grid gap-2"><legend class="text-sm font-medium">Card crop</legend><div class="flex flex-wrap gap-2">{#each Object.keys(MENU_IMAGE_ASPECTS) as aspect}<label class="flex items-center gap-1 text-sm"><input type="radio" name="cropAspect" value={aspect} checked={cropAspect === aspect} onchange={() => { cropAspect = aspect as MenuImageAspect; cropDirty = true; }} />{aspect}</label>{/each}</div>
									<label class="grid gap-1 text-sm">Horizontal focus <input type="range" min="-100" max="100" step="1" bind:value={cropX} oninput={() => cropDirty = true} /></label><label class="grid gap-1 text-sm">Vertical focus <input type="range" min="-100" max="100" step="1" bind:value={cropY} oninput={() => cropDirty = true} /></label>
									<div class="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onclick={() => { rotation = (rotation + 270) % 360; cropDirty = true; }}>Rotate left</Button><Button type="button" size="sm" variant="outline" onclick={() => { rotation = (rotation + 90) % 360; cropDirty = true; }}>Rotate right</Button><Button type="button" size="sm" onclick={preparePhoto} disabled={preparingPhoto}>Apply crop</Button><Button type="button" size="sm" variant="ghost" onclick={() => resetPhoto()}>Cancel photo</Button></div></fieldset>
								<div class="grid gap-1"><p class="text-sm font-medium">Prepared preview</p>{#if preparedPhotoUrl}<img class="w-full rounded-md border object-cover" style={`aspect-ratio: ${MENU_IMAGE_ASPECTS[preparedAspect]}`} src={preparedPhotoUrl} alt={selectedItem ? `${value(selectedItem.name)} prepared menu-card preview` : 'Prepared menu-card preview'} width="1200" height={Math.round(1200 / MENU_IMAGE_ASPECTS[preparedAspect])} />{:else}<img class="w-full rounded-md border object-contain" style={`aspect-ratio: ${MENU_IMAGE_ASPECTS[cropAspect]}`} src={sourcePhotoUrl} alt="Selected source for crop" width="1200" height={Math.round(1200 / MENU_IMAGE_ASPECTS[cropAspect])} />{/if}</div>
							</div>
						{/if}
						{#if photoMessage}<p class="text-xs text-muted-foreground" role="status">{photoMessage}</p>{/if}
					</div>
					>
					<label class="grid gap-1"
						>Static image path<Input
							name="imageUrl"
							value={selectedItem ? value(selectedItem.image_url) : ''}
							placeholder="/menu/dish.jpg"
						/></label
					>
					<p class="text-xs text-muted-foreground sm:col-span-2">
						Use an uploaded photo or a local static path under <code>/menu/</code>; uploaded photos take precedence.
					</p>
					<label class="grid gap-1"
						>Dietary labels<Input
							name="dietaryLabels"
							value={selectedItem ? value(selectedItem.dietary_labels) : ''}
							placeholder="Vegan, gluten-free"
						/></label
					>
					<label class="grid gap-1"
						>Search tags<Input
							name="tags"
							value={selectedItem ? value(selectedItem.tags) : ''}
							placeholder="spicy, signature"
						/></label
					>
					<fieldset class="grid gap-2">
						<legend class="text-sm font-medium">Allergens</legend>
						<div class="flex flex-wrap gap-3">
							{#each data.allergens as allergen}<label class="flex items-center gap-2 text-sm"
									><Switch
										name="allergen"
										value={value(allergen.id)}
										checked={selectedItem
											? data.links.some(
													(link) =>
														value(link.item_id) === value(selectedItem.id) &&
														value(link.allergen_id) === value(allergen.id),
												)
											: false}
									/>{value(allergen.name)}</label
								>{/each}
						</div>
					</fieldset>
					<label class="flex items-center gap-2 sm:col-span-2"
						><Switch name="enabled" checked={selectedItem ? checked(selectedItem.enabled) : true} /> Published and enabled</label
					>
					<label class="grid gap-1 text-sm font-medium">Availability
						<select name="availability" class="h-9 rounded-md border bg-background px-3" value={selectedItem ? value(selectedItem.availability) : 'available'}>
							<option value="available">Available</option><option value="sold_out">Sold out</option>
						</select>
					</label>
					<label class="grid gap-1 text-sm font-medium">Customer discovery
						<select name="discoverability" class="h-9 rounded-md border bg-background px-3" value={selectedItem ? value(selectedItem.discoverability) : 'browse'}>
							<option value="browse">Show in menu browsing</option><option value="suggestion_only">Suggestion only</option>
						</select>
						<span class="text-xs font-normal text-muted-foreground">Suggestion-only items must be added through an enabled suggestion relationship.</span>
					</label>
					<div class="sm:col-span-2">
						<Button bind:ref={saveItemButton} type="submit" disabled={preparingPhoto || cropDirty}>{selectedItem ? 'Save item' : 'Create item'}</Button>{#if cropDirty}<span class="ml-2 text-xs text-muted-foreground">Apply the crop before saving.</span>{/if}
					</div>
				</form>
			</details>

			{#if selectedItem}
				{@const itemId = value(selectedItem.id)}
				{@const promotion = data.promotions.find((row) => value(row.item_id) === itemId)}
				<details class="rounded-md border p-3">
					<summary class="cursor-pointer font-medium">Promotion</summary>
					<form
						method="POST"
						action="?/promotion"
						onsubmit={(event) => confirmPromotionRemoval(event)}
						class="mt-4 grid gap-3 sm:grid-cols-2"
					>
						<input type="hidden" name="item" value={itemId} />
						<label class="grid gap-1"
							>Label<Input name="label" value={promotion ? value(promotion.label) : ''} /></label
						>
						<label class="grid gap-1"
							>Promo price<Input
								name="price"
								type="number"
								step="0.01"
								min="0"
								value={promotion?.price_minor == null ? '' : money(promotion.price_minor)}
							/></label
						>
						<label class="grid gap-1 sm:col-span-2"
							>Description<Input
								name="description"
								value={promotion ? value(promotion.description) : ''}
							/></label
						>
						<label class="grid gap-1"
							>Starts<Input
								name="start"
								value={promotion ? value(promotion.starts_at) : ''}
							/></label
						>
						<label class="grid gap-1"
							>Ends<Input name="end" value={promotion ? value(promotion.ends_at) : ''} /></label
						>
						<label class="flex items-center gap-2"
							><Switch name="enabled" checked={promotion ? checked(promotion.enabled) : true} /> Enabled</label
						>
						<label class="flex items-center gap-2"><Switch name="clear" /> Remove promotion</label>
						<div class="sm:col-span-2">
							<Button type="submit" variant="secondary">Save promotion</Button>
						</div>
					</form>
				</details>

				<details class="rounded-md border p-3">
					<summary class="cursor-pointer font-medium">Options</summary>
					<form method="POST" action="?/group" class="mt-4 grid gap-2 sm:grid-cols-4">
						<input type="hidden" name="item" value={itemId} /><Input
							name="name"
							placeholder="Group name"
							required
						/><Input name="min" type="number" min="0" value="0" /><Input
							name="max"
							type="number"
							min="1"
							value="1"
						/><label class="flex items-center gap-2"
							><Switch name="enabled" checked /> Enabled</label
						><Button type="submit" size="sm">Add group</Button>
					</form>
					<div class="mt-3 space-y-3">
						{#each data.groups.filter((row) => value(row.item_id) === itemId) as group}
							{@const groupId = value(group.id)}
							<section
								class="space-y-3 rounded-md bg-muted/40 p-3"
								aria-label={`${value(group.name)} option group`}
							>
								<form method="POST" action="?/groupEdit" class="grid gap-2 sm:grid-cols-5">
									<input type="hidden" name="id" value={groupId} /><Input
										name="name"
										value={value(group.name)}
									/><Input
										name="min"
										type="number"
										min="0"
										value={value(group.min_choices)}
									/><Input
										name="max"
										type="number"
										min="0"
										value={value(group.max_choices)}
									/><label class="flex items-center gap-2"
										><Switch name="enabled" checked={checked(group.enabled)} /> Enabled</label
									><Button type="submit" size="sm">Save group</Button>
								</form>
								<div class="flex flex-wrap gap-2">
									{#each ['up', 'down'] as direction}<form method="POST" action="?/groupMove">
											<input type="hidden" name="id" value={groupId} /><input
												type="hidden"
												name="direction"
												value={direction}
											/><Button type="submit" size="sm" variant="outline">Move {direction}</Button>
										</form>{/each}
									<form
										method="POST"
										action="?/groupDelete"
										onsubmit={(event) =>
											confirmDestructive(event, `Delete ${value(group.name)} and all its choices?`)}
									>
										<input type="hidden" name="id" value={groupId} /><Button
											type="submit"
											size="sm"
											variant="destructive">Delete group</Button
										>
									</form>
								</div>
								<form method="POST" action="?/choice" class="grid gap-2 sm:grid-cols-5">
									<input type="hidden" name="group" value={groupId} /><Input
										name="code"
										placeholder="Code"
									/><Input name="name" placeholder="Choice" required /><Input
										name="delta"
										type="number"
										step="0.01"
										value="0"
									/><label class="flex items-center gap-2"
										><Switch name="enabled" checked /> Enabled</label
									><Button type="submit" size="sm">Add choice</Button>
								</form>
								{#each data.choices.filter((row) => value(row.group_id) === groupId) as choice}
									<div class="space-y-2 rounded border bg-background p-2">
										<form method="POST" action="?/choiceEdit" class="grid gap-2 sm:grid-cols-5">
											<input type="hidden" name="id" value={value(choice.id)} /><Input
												name="code"
												value={value(choice.code)}
											/><Input name="name" value={value(choice.name)} /><Input
												name="delta"
												type="number"
												step="0.01"
												value={money(choice.price_delta_minor)}
											/><label class="flex items-center gap-2"
												><Switch name="enabled" checked={checked(choice.enabled)} /> Enabled</label
											><Button type="submit" size="sm">Save choice</Button>
										</form>
										<div class="flex flex-wrap gap-2">
											{#each ['up', 'down'] as direction}<form method="POST" action="?/choiceMove">
													<input type="hidden" name="id" value={value(choice.id)} /><input
														type="hidden"
														name="direction"
														value={direction}
													/><Button type="submit" size="sm" variant="outline"
														>Move {direction}</Button
													>
												</form>{/each}
											<form
												method="POST"
												action="?/choiceDelete"
												onsubmit={(event) =>
													confirmDestructive(event, `Delete ${value(choice.name)}?`)}
											>
												<input type="hidden" name="id" value={value(choice.id)} /><Button
													type="submit"
													size="sm"
													variant="destructive">Delete choice</Button
												>
											</form>
										</div>
									</div>
								{/each}
							</section>
						{/each}
					</div>
				</details>

				<details class="rounded-md border p-3">
					<summary class="cursor-pointer font-medium">Suggestions</summary>
					<p class="mt-2 text-sm text-muted-foreground">
						Ordered, optional add-ons shown after this item is configured.
					</p>
					<form method="POST" action="?/suggestion" class="mt-4 grid gap-2 sm:grid-cols-4">
						<input type="hidden" name="item" value={itemId} /><label class="grid gap-1"
							>Item<Select.Root type="single" name="suggested" required
								><Select.Trigger aria-label="Suggested item" class="w-full"
									>Select an item</Select.Trigger
								><Select.Content
									>{#each data.items.filter((candidate) => value(candidate.id) !== itemId) as candidate}<Select.Item
											value={value(candidate.id)}>{value(candidate.name)}</Select.Item
										>{/each}</Select.Content
								></Select.Root
							></label
						><label class="grid gap-1"
							>Order<Input name="position" type="number" min="0" value="0" /></label
						><label class="flex items-center gap-2 self-end"
							><Switch name="enabled" checked /> Enabled</label
						><Button type="submit" class="self-end" size="sm">Save suggestion</Button>
					</form>
					<div class="mt-3 space-y-2">
						{#each data.suggestions.filter((row) => value(row.item_id) === itemId) as suggestion}{@const suggestedItem =
								data.items.find(
									(candidate) => value(candidate.id) === value(suggestion.suggested_item_id),
								)}
							<div class="flex flex-wrap items-center gap-2 rounded-md border p-2">
								<span class="grow text-sm"
									>{suggestedItem ? value(suggestedItem.name) : 'Unavailable item'} · position {value(
										suggestion.position,
									)}</span
								><Badge variant={checked(suggestion.enabled) ? 'default' : 'outline'}
									>{checked(suggestion.enabled) ? 'Enabled' : 'Disabled'}</Badge
								>
								<form
									method="POST"
									action="?/suggestionDelete"
									onsubmit={(event) => confirmDestructive(event, 'Remove this suggestion?')}
								>
									<input type="hidden" name="item" value={itemId} /><input
										type="hidden"
										name="suggested"
										value={value(suggestion.suggested_item_id)}
									/><Button type="submit" size="sm" variant="destructive">Remove</Button>
								</form>
							</div>{/each}
					</div>
				</details>

				<details class="rounded-md border border-destructive/40 p-3">
					<summary class="cursor-pointer font-medium text-destructive">Danger zone</summary>
					<div class="mt-3 flex flex-wrap gap-2">
						<form method="POST" action="?/move">
							<input type="hidden" name="itemId" value={itemId} /><input
								type="hidden"
								name="direction"
								value="up"
							/><Button type="submit" variant="outline" size="sm">Move up</Button>
						</form>
						<form method="POST" action="?/move">
							<input type="hidden" name="itemId" value={itemId} /><input
								type="hidden"
								name="direction"
								value="down"
							/><Button type="submit" variant="outline" size="sm">Move down</Button>
						</form>
						<form
							method="POST"
							action="?/archive"
							onsubmit={(event) =>
								confirmDestructive(event, `Archive ${value(selectedItem.name)}?`)}
						>
							<input type="hidden" name="id" value={itemId} /><Button
								type="submit"
								variant="destructive"
								size="sm">Archive item</Button
							>
						</form>
					</div>
				</details>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
