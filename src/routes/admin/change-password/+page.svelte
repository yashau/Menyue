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

<div class="mx-auto max-w-md">
	<Card
		><CardHeader
			><CardTitle><h1>Choose a new password</h1></CardTitle><CardDescription
				>Your temporary password must be replaced before continuing.</CardDescription
			></CardHeader
		><CardContent class="space-y-4">
			{#if form?.message}<p class="text-destructive" role="alert">{form.message}</p>{/if}
			<form method="POST" class="space-y-3">
				<div class="space-y-2">
					<Label for="password">New password</Label><Input
						id="password"
						type="password"
						name="password"
						minlength={12}
						maxlength={128}
						required
					/>
				</div>
				<div class="space-y-2">
					<Label for="confirm">Confirm password</Label><Input
						id="confirm"
						type="password"
						name="confirm"
						minlength={12}
						maxlength={128}
						required
					/>
				</div>
				<Button type="submit">Update password</Button>
			</form>
		</CardContent></Card
	>
</div>
