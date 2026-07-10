<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<main class="grid min-h-screen place-items-center bg-stone-100 p-6">
	<form method="POST" class="w-full max-w-sm rounded-xl bg-white p-7 shadow-sm">
		<h1 class="text-2xl font-semibold">Menyue staff</h1>
		<p class="mt-2 text-sm text-muted-foreground">Sign in to the protected CMS.</p>
		{#if form?.message}<p class="mt-4 text-sm text-destructive">{form.message}</p>{/if}
		<div class="mt-6 grid gap-2">
			<Label for="username">Username</Label><Input
				id="username"
				name="username"
				autocomplete="username"
				required
			/>
		</div>
		<div class="mt-4 grid gap-2">
			<Label for="password">Password</Label><Input
				id="password"
				type="password"
				name="password"
				autocomplete="current-password"
				required
			/>
		</div>
		<Button class="mt-6 w-full">Sign in</Button>
	</form>
</main>
