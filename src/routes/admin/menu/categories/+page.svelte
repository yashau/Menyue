<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-3xl font-semibold">Categories</h1>
<form method="POST" action="?/create" class="mt-6 flex gap-2">
	<Input name="name" placeholder="New category" required /><Button>Add</Button>
</form>
<div class="mt-6 space-y-3">
	{#each data.categories as c}<form method="POST" action="?/update" class="rounded bg-white p-3">
			<input type="hidden" name="id" value={String(c.id)} /><Input
				class="inline w-48"
				name="name"
				value={String(c.name)}
			/><Input
				class="inline w-64"
				name="description"
				value={String(c.description ?? '')}
				placeholder="description"
			/><label
				><input name="enabled" type="checkbox" checked={Number(c.enabled) === 1} /> enabled</label
			><Button size="sm">Save</Button>
		</form>
		<form method="POST" action="?/move" class="inline">
			<input type="hidden" name="id" value={String(c.id)} /><input
				type="hidden"
				name="direction"
				value="up"
			/><Button size="sm" variant="outline" aria-label="Move {String(c.name)} up">↑</Button>
		</form>
		<form method="POST" action="?/move" class="inline">
			<input type="hidden" name="id" value={String(c.id)} /><input
				type="hidden"
				name="direction"
				value="down"
			/><Button size="sm" variant="outline" aria-label="Move {String(c.name)} down">↓</Button>
		</form>{/each}
</div>
