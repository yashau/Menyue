<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { ArrowDown, ArrowUp } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let editorOpen = $state(false);
	let selectedCategoryId = $state<string | null>(null);

	const value = (input: unknown) => String(input ?? '');
	const enabled = (input: unknown) => Number(input) === 1;
	const selectedCategory = $derived(
		data.categories.find((category) => value(category.id) === selectedCategoryId),
	);

	function openEditor(categoryId: string | null = null) {
		selectedCategoryId = categoryId;
		editorOpen = true;
	}

	function confirmArchive(event: SubmitEvent) {
		if (!window.confirm(`Archive ${value(selectedCategory?.name)}? Its items will no longer appear on the menu.`))
			event.preventDefault();
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-3xl font-semibold tracking-tight">Categories</h1>
			<p class="mt-2 text-sm text-muted-foreground">Organize the sections shown on your menu.</p>
		</div>
		<Button type="button" onclick={() => openEditor()}>Create category</Button>
	</header>

	<section class="grid gap-3" aria-label="Category summaries">
		{#each data.categories as category (value(category.id))}
			{@const categoryId = value(category.id)}
			<article
				class="grid gap-3 rounded-lg border border-l-4 border-l-primary/60 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
			>
				<div class="min-w-0 space-y-2">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="truncate font-semibold">{value(category.name)}</h2>
						<Badge variant="secondary">{value(category.code)}</Badge>
						<Badge variant={enabled(category.enabled) ? 'default' : 'outline'}
							>{enabled(category.enabled) ? 'Enabled' : 'Disabled'}</Badge
						>
					</div>
					<p class="text-sm text-muted-foreground">
						{value(category.item_count)} menu {Number(category.item_count) === 1 ? 'item' : 'items'}
					</p>
					{#if category.description}
						<p class="line-clamp-2 text-sm text-muted-foreground">{value(category.description)}</p>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2 sm:justify-end">
					<Button type="button" variant="outline" onclick={() => openEditor(categoryId)}>Edit</Button>
					<form method="POST" action="?/move">
						<input type="hidden" name="id" value={categoryId} />
						<input type="hidden" name="direction" value="up" />
						<Button type="submit" size="icon" variant="outline" aria-label="Move {value(category.name)} up"
							><ArrowUp /></Button
						>
					</form>
					<form method="POST" action="?/move">
						<input type="hidden" name="id" value={categoryId} />
						<input type="hidden" name="direction" value="down" />
						<Button type="submit" size="icon" variant="outline" aria-label="Move {value(category.name)} down"
							><ArrowDown /></Button
						>
					</form>
				</div>
			</article>
		{:else}
			<div class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No categories yet. Create one to start organizing your menu.
			</div>
		{/each}
	</section>
</div>

{#if editorOpen}
	<Dialog.Root bind:open={editorOpen}>
		<Dialog.Content
			class="max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] gap-4 overflow-y-auto rounded-lg p-4 sm:max-w-lg sm:p-6"
		>
			<Dialog.Header class="pr-9">
				<Dialog.Title>{selectedCategory ? `Edit ${value(selectedCategory.name)}` : 'Create category'}</Dialog.Title>
				<Dialog.Description>
					{selectedCategory
						? 'Update this menu section or archive it when it is no longer needed.'
						: 'Create a menu section, then add its items.'}
				</Dialog.Description>
			</Dialog.Header>

			{#if selectedCategory}
				<form method="POST" action="?/update" class="grid gap-4">
					<input type="hidden" name="id" value={value(selectedCategory.id)} />
					<label class="grid gap-1">
						Name
						<Input name="name" value={value(selectedCategory.name)} required />
					</label>
					<div class="grid gap-1">
						<Label for="category-code">Code</Label>
						<Input id="category-code" value={value(selectedCategory.code)} readonly />
					</div>
					<label class="grid gap-1">
						Description
						<Input
							name="description"
							value={value(selectedCategory.description)}
							placeholder="Optional description"
						/>
					</label>
					<label class="flex items-center gap-2"><Switch name="enabled" checked={enabled(selectedCategory.enabled)} /> Enabled</label>
					<div><Button type="submit">Save category</Button></div>
				</form>
			{:else}
				<form method="POST" action="?/create" class="grid gap-4">
					<label class="grid gap-1">Name<Input name="name" required /></label>
					<label class="grid gap-1">
						Description
						<Input name="description" placeholder="Optional description" />
					</label>
					<p class="text-sm text-muted-foreground">New categories start enabled.</p>
					<div><Button type="submit">Create category</Button></div>
				</form>
			{/if}

			{#if selectedCategory}
				<section class="rounded-md border border-destructive/40 p-3" aria-label="Category danger zone">
					<h2 class="font-medium text-destructive">Danger zone</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Archiving removes this category and its items from the published menu.
					</p>
					<form method="POST" action="?/archive" onsubmit={confirmArchive} class="mt-3">
						<input type="hidden" name="id" value={value(selectedCategory.id)} />
						<Button type="submit" variant="destructive">Archive category</Button>
					</form>
				</section>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
