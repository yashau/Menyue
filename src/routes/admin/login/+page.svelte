<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<main class="grid min-h-screen place-items-center bg-muted/40 p-4">
	<Card class="w-full max-w-sm"
		><CardHeader
			><CardTitle>Sign in</CardTitle><CardDescription
				>Use your staff account to manage Menyue.</CardDescription
			></CardHeader
		><CardContent
			><form method="POST" class="grid gap-4">
				{#if form?.message}<p class="text-sm text-destructive" role="alert">{form.message}</p>{/if}
				<div class="grid gap-2">
					<Label for="username">Username</Label><Input
						id="username"
						name="username"
						autocomplete="username"
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="password">Password</Label><Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
					/>
				</div>
				<Button type="submit" class="w-full">Sign in</Button>
			</form></CardContent
		></Card
	>
</main>
