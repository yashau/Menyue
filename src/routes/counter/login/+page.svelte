<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<main class="grid min-h-screen place-items-center bg-amber-50 p-6">
	<form method="POST" class="w-full max-w-sm rounded-xl bg-white p-7 shadow-sm">
		<h1 class="text-2xl font-semibold">Counter board</h1>
		<p class="mt-2 text-sm text-muted-foreground">Use the counter password to continue.</p>
		{#if form?.message}<p class="mt-4 text-sm text-destructive">{form.message}</p>{/if}
		<div class="mt-6 grid gap-2">
			<Label for="password">Password</Label><Input
				id="password"
				type="password"
				name="password"
				required
			/>
		</div>
		<Button class="mt-6 w-full">Open board</Button>
	</form>
</main>
