<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();
	let createOpen = $state(false);
	function confirmAction(event: SubmitEvent, message: string) {
		if (!window.confirm(message)) event.preventDefault();
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div><h1 class="text-3xl font-bold tracking-tight">Counter operators</h1><p class="text-muted-foreground">Tenant-scoped accounts for the service board. Password changes and access changes sign the operator out immediately.</p></div>
		<Button onclick={() => (createOpen = true)}>Add operator</Button>
	</div>
	{#if form?.message}<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{form.message}</p>{/if}
	<Dialog.Root bind:open={createOpen}>
		<Dialog.Content class="sm:max-w-lg"><Dialog.Header><Dialog.Title>Add counter operator</Dialog.Title><Dialog.Description>Choose a unique username for this restaurant. The password is stored only as a PBKDF2 hash.</Dialog.Description></Dialog.Header>
			<form method="POST" action="?/create" class="grid gap-4 py-4">
				<div class="grid gap-2"><Label for="operator-name">Display name</Label><Input id="operator-name" name="displayName" required maxlength={100} /></div>
				<div class="grid gap-2"><Label for="operator-username">Username</Label><Input id="operator-username" name="username" autocomplete="username" required pattern="[a-zA-Z0-9._-]+" /></div>
				<div class="grid gap-2"><Label for="operator-password">Password</Label><Input id="operator-password" name="password" type="password" autocomplete="new-password" required minlength={12} /></div>
				<Dialog.Footer><Button type="submit">Create operator</Button></Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
	<div class="grid gap-4 md:grid-cols-2">
		{#each data.operators as operator}
			<Card><CardHeader><CardTitle>{String(operator.display_name)}</CardTitle><CardDescription>@{String(operator.normalized_username)} · {Number(operator.enabled) === 1 ? 'Enabled' : 'Disabled'}</CardDescription></CardHeader>
				<CardContent class="space-y-3">
					<div class="flex flex-wrap gap-2">
						<form method="POST" action="?/setEnabled" onsubmit={(event) => confirmAction(event, `${Number(operator.enabled) === 1 ? 'Disable' : 'Enable'} this operator?`)}><input type="hidden" name="id" value={String(operator.id)} /><input type="hidden" name="enabled" value={Number(operator.enabled) === 1 ? 'false' : 'true'} /><Button type="submit" size="sm" variant={Number(operator.enabled) === 1 ? 'destructive' : 'outline'}>{Number(operator.enabled) === 1 ? 'Disable' : 'Enable'}</Button></form>
						<form method="POST" action="?/revoke" onsubmit={(event) => confirmAction(event, 'Revoke all active sessions for this operator?')}><input type="hidden" name="id" value={String(operator.id)} /><Button type="submit" size="sm" variant="outline">Revoke sessions</Button></form>
					</div>
					<form method="POST" action="?/reset" onsubmit={(event) => confirmAction(event, 'Reset this operator password and revoke current sessions?')} class="flex flex-wrap gap-2"><input type="hidden" name="id" value={String(operator.id)} /><Input class="min-w-48 flex-1" name="password" type="password" autocomplete="new-password" minlength={12} required aria-label={`New password for ${String(operator.display_name)}`} /><Button type="submit" size="sm" variant="outline">Reset password</Button></form>
				</CardContent>
			</Card>
		{:else}
			<Card class="md:col-span-2"><CardContent class="py-8 text-sm text-muted-foreground">No counter operators exist for this restaurant. Add one before counter staff can sign in.</CardContent></Card>
		{/each}
	</div>
</div>
