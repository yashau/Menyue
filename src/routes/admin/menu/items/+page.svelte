<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const value = (input: unknown) => String(input ?? '');
	const checked = (input: unknown) => Number(input) === 1;
</script>

<div class="space-y-6">
	<header>
		<p class="text-sm text-muted-foreground">Create, price, publish and arrange every menu item.</p>
		<h1 class="text-3xl font-semibold tracking-tight">Menu items</h1>
	</header>

	<Card.Root>
		<Card.Header><Card.Title>Add menu item</Card.Title></Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/save"
				enctype="multipart/form-data"
				class="grid gap-3 md:grid-cols-2"
			>
				<label
					>Category<select
						class="mt-1 h-10 w-full rounded-md border bg-background px-3"
						name="category"
						required
						>{#each data.categories as category}<option value={value(category.id)}
								>{value(category.name)}</option
							>{/each}</select
					></label
				>
				<label>Item code<Input name="code" required /></label>
				<label>Name<Input name="name" required /></label>
				<label>Price<Input name="price" type="number" min="0" step="0.01" required /></label>
				<label class="md:col-span-2"
					>Description<textarea
						class="mt-1 min-h-20 w-full rounded-md border bg-background p-3"
						name="description"></textarea></label
				>
				<label class="md:col-span-2"
					>Allergy note<textarea
						class="mt-1 min-h-16 w-full rounded-md border bg-background p-3"
						name="allergy"></textarea></label
				>
				<label
					>Photo<Input name="photo" type="file" accept="image/png,image/jpeg,image/webp" /></label
				>
				<fieldset class="flex flex-wrap gap-3">
					<legend>Allergens</legend>{#each data.allergens as allergen}<label
							><input type="checkbox" name="allergen" value={value(allergen.id)} />
							{value(allergen.name)}</label
						>{/each}
				</fieldset>
				<p class="text-sm text-muted-foreground">
					New items start enabled; you can disable them immediately after creation.
				</p>
				<div class="md:col-span-2"><Button type="submit">Create item</Button></div>
			</form>
		</Card.Content>
	</Card.Root>

	{#each data.items as item}
		{@const itemId = value(item.id)}
		{@const promotion = data.promotions.find((row) => value(row.item_id) === itemId)}
		<Card.Root>
			<Card.Header
				><Card.Title>{value(item.name)}</Card.Title><Card.Description
					>{value(item.code)} · {value(item.category)}</Card.Description
				></Card.Header
			>
			<Card.Content class="space-y-5">
				{#if item.photo_asset_id}<img
						class="h-40 w-full rounded-lg object-cover"
						src={`/media/${value(item.photo_asset_id)}`}
						alt={value(item.name)}
					/>{/if}
				<form
					method="POST"
					action="?/save"
					enctype="multipart/form-data"
					class="grid gap-3 md:grid-cols-2"
				>
					<input type="hidden" name="id" value={itemId} />
					<label
						>Category<select
							class="mt-1 h-10 w-full rounded-md border bg-background px-3"
							name="category"
							>{#each data.categories as category}<option
									value={value(category.id)}
									selected={value(category.id) === value(item.category_id)}
									>{value(category.name)}</option
								>{/each}</select
						></label
					>
					<label>Code<Input name="code" value={value(item.code)} required /></label>
					<label>Name<Input name="name" value={value(item.name)} required /></label>
					<label
						>Price<Input
							name="price"
							type="number"
							min="0"
							step="0.01"
							value={Number(item.base_price_minor) / 100}
							required
						/></label
					>
					<label class="md:col-span-2"
						>Description<textarea
							class="mt-1 min-h-20 w-full rounded-md border bg-background p-3"
							name="description">{value(item.description)}</textarea
						></label
					>
					<label class="md:col-span-2"
						>Allergy note<textarea
							class="mt-1 min-h-16 w-full rounded-md border bg-background p-3"
							name="allergy">{value(item.allergy_note)}</textarea
						></label
					>
					<label
						>Replace photo<Input
							name="photo"
							type="file"
							accept="image/png,image/jpeg,image/webp"
						/></label
					>
					<fieldset class="flex flex-wrap gap-3">
						<legend>Allergens</legend>{#each data.allergens as allergen}<label
								><input
									type="checkbox"
									name="allergen"
									value={value(allergen.id)}
									checked={data.links.some(
										(link) =>
											value(link.item_id) === itemId &&
											value(link.allergen_id) === value(allergen.id),
									)}
								/>
								{value(allergen.name)}</label
							>{/each}
					</fieldset>
					<label
						><input type="checkbox" name="enabled" checked={checked(item.enabled)} /> Enabled</label
					>
					<div class="md:col-span-2"><Button type="submit">Save item</Button></div>
				</form>

				<div class="flex flex-wrap gap-2">
					{#each ['up', 'down'] as direction}<form method="POST" action="?/move">
							<input type="hidden" name="itemId" value={itemId} /><input
								type="hidden"
								name="direction"
								value={direction}
							/><Button type="submit" variant="outline" size="sm">Move {direction}</Button>
						</form>{/each}
					<form method="POST" action="?/archive">
						<input type="hidden" name="id" value={itemId} /><Button
							type="submit"
							variant="destructive"
							size="sm">Archive</Button
						>
					</form>
				</div>

				<section class="rounded-lg border p-4">
					<h3 class="font-medium">Promotion</h3>
					<form method="POST" action="?/promotion" class="mt-3 grid gap-2 md:grid-cols-2">
						<input type="hidden" name="item" value={itemId} /><label
							>Label<Input name="label" value={promotion ? value(promotion.label) : ''} /></label
						><label
							>Promo price<Input
								name="price"
								type="number"
								step="0.01"
								min="0"
								value={promotion?.price_minor == null ? '' : Number(promotion.price_minor) / 100}
							/></label
						>
						<label class="md:col-span-2"
							>Description<Input
								name="description"
								value={promotion ? value(promotion.description) : ''}
							/></label
						><label
							>Starts<Input
								name="start"
								value={promotion ? value(promotion.starts_at) : ''}
							/></label
						><label
							>Ends<Input name="end" value={promotion ? value(promotion.ends_at) : ''} /></label
						>
						<label
							><input
								type="checkbox"
								name="enabled"
								checked={promotion ? checked(promotion.enabled) : true}
							/> Enabled</label
						><label><input type="checkbox" name="clear" /> Remove promotion</label>
						<div class="md:col-span-2">
							<Button type="submit" variant="secondary">Save promotion</Button>
						</div>
					</form>
				</section>

				<section class="space-y-4 rounded-lg border p-4">
					<h3 class="font-medium">Combo options</h3>
					<form method="POST" action="?/group" class="grid gap-2 md:grid-cols-4">
						<input type="hidden" name="item" value={itemId} /><Input
							name="name"
							placeholder="Group name"
							required
						/><Input name="min" type="number" min="0" value="0" /><Input
							name="max"
							type="number"
							min="1"
							value="1"
						/><label><input type="checkbox" name="enabled" checked /> Enabled</label><Button
							type="submit"
							size="sm">Add group</Button
						>
					</form>
					{#each data.groups.filter((row) => value(row.item_id) === itemId) as group}
						{@const groupId = value(group.id)}
						<div class="space-y-3 rounded-md bg-muted/40 p-3">
							<form method="POST" action="?/groupEdit" class="grid gap-2 md:grid-cols-5">
								<input type="hidden" name="id" value={groupId} /><Input
									name="name"
									value={value(group.name)}
								/><Input name="min" type="number" min="0" value={value(group.min_choices)} /><Input
									name="max"
									type="number"
									min="0"
									value={value(group.max_choices)}
								/><label
									><input type="checkbox" name="enabled" checked={checked(group.enabled)} /> Enabled</label
								><Button type="submit" size="sm">Save group</Button>
							</form>
							<div class="flex gap-2">
								{#each ['up', 'down'] as direction}<form method="POST" action="?/groupMove">
										<input type="hidden" name="id" value={groupId} /><input
											type="hidden"
											name="direction"
											value={direction}
										/><Button size="sm" variant="outline">{direction}</Button>
									</form>{/each}
								<form method="POST" action="?/groupDelete">
									<input type="hidden" name="id" value={groupId} /><Button
										size="sm"
										variant="destructive">Delete</Button
									>
								</form>
							</div>
							<form method="POST" action="?/choice" class="grid gap-2 md:grid-cols-5">
								<input type="hidden" name="group" value={groupId} /><Input
									name="code"
									placeholder="Code"
								/><Input name="name" placeholder="Choice" required /><Input
									name="delta"
									type="number"
									step="0.01"
									value="0"
								/><label><input type="checkbox" name="enabled" checked /> Enabled</label><Button
									size="sm">Add choice</Button
								>
							</form>
							{#each data.choices.filter((row) => value(row.group_id) === groupId) as choice}
								<form
									method="POST"
									action="?/choiceEdit"
									class="grid gap-2 rounded border bg-background p-2 md:grid-cols-6"
								>
									<input type="hidden" name="id" value={value(choice.id)} /><Input
										name="code"
										value={value(choice.code)}
									/><Input name="name" value={value(choice.name)} /><Input
										name="delta"
										type="number"
										step="0.01"
										value={Number(choice.price_delta_minor) / 100}
									/><label
										><input type="checkbox" name="enabled" checked={checked(choice.enabled)} /> Enabled</label
									><Button size="sm">Save</Button>
								</form>
								<div class="flex gap-2">
									{#each ['up', 'down'] as direction}<form method="POST" action="?/choiceMove">
											<input type="hidden" name="id" value={value(choice.id)} /><input
												type="hidden"
												name="direction"
												value={direction}
											/><Button size="sm" variant="outline">{direction}</Button>
										</form>{/each}
									<form method="POST" action="?/choiceDelete">
										<input type="hidden" name="id" value={value(choice.id)} /><Button
											size="sm"
											variant="destructive">Delete choice</Button
										>
									</form>
								</div>
							{/each}
						</div>
					{/each}
				</section>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
