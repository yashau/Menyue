<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-3xl font-semibold">Users & roles</h1>
<form method="POST" action="?/create" class="mt-5 flex flex-wrap gap-2">
	<Input name="username" placeholder="username" required /><Input
		name="name"
		placeholder="display name"
		required
	/><Input name="password" type="password" placeholder="temporary password" required /><select
		name="role"><option>admin</option><option>manager</option></select
	><Button>Create</Button>
</form>
<div class="mt-6 space-y-3">
	{#each data.users as u}<form method="POST" action="?/update" class="rounded bg-white p-3">
			<input type="hidden" name="id" value={String(u.id)} /><strong>{String(u.display_name)}</strong
			>
			<Input class="inline w-28" name="role" value={String(u.role)} /><label
				><input name="enabled" type="checkbox" checked={Number(u.enabled) === 1} /> enabled</label
			><Button size="sm">Save</Button>
		</form>
		<form method="POST" action="?/reset" class="ml-3">
			<input type="hidden" name="id" value={String(u.id)} /><Input
				class="inline w-48"
				name="password"
				type="password"
				placeholder="new temporary password"
				required
			/><Button size="sm" variant="outline">Reset password</Button>
		</form>{/each}
</div>
