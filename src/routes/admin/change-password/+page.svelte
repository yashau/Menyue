<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<main class="mx-auto max-w-md space-y-4 p-6">
	<h1 class="text-3xl font-semibold">Choose a new password</h1>
	<p>Your temporary password must be replaced before continuing.</p>
	{#if form?.message}<p class="text-destructive">{form.message}</p>{/if}
	<form method="POST" class="space-y-3">
		<label
			>New password<Input
				type="password"
				name="password"
				minlength={12}
				maxlength={128}
				required
			/></label
		><label
			>Confirm password<Input
				type="password"
				name="confirm"
				minlength={12}
				maxlength={128}
				required
			/></label
		><Button type="submit">Update password</Button>
	</form>
</main>
