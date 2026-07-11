<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import UserIcon from '@lucide/svelte/icons/user';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data, form } = $props();
	let createOpen = $state(false);
	let resetFor = $state<{ id: number; username: string } | null>(null);
	let fRole = $state('counter');

	$effect(() => {
		if (createOpen) fRole = 'counter';
	});

	const roleVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
		admin: 'default',
		manager: 'secondary',
		counter: 'outline'
	};
	const roleLabel: Record<string, string> = {
		counter: 'Counter staff',
		manager: 'Manager',
		admin: 'Administrator'
	};
</script>

<svelte:head><title>Users · Menyue admin</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<header class="mb-4 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Users</h1>
			<p class="text-sm text-muted-foreground">{data.users.length} accounts</p>
		</div>
		<Button onclick={() => (createOpen = true)}><Plus /> New account</Button>
	</header>

	{#if form?.error}
		<div class="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{form.error}
		</div>
	{/if}

	<Card.Root class="gap-0 py-0">
		{#each data.users as u (u.id)}
			<div class="flex items-center gap-3 border-b border-border p-3 last:border-0">
				<span class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<UserIcon class="size-4.5" />
				</span>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="font-medium">{u.display_name}</span>
						<Badge variant={roleVariant[u.role] ?? 'outline'} class="uppercase">{u.role}</Badge>
					</div>
					<div class="text-xs text-muted-foreground">@{u.username}</div>
				</div>
				<Button variant="outline" size="sm" onclick={() => (resetFor = { id: u.id, username: u.username })}>
					Reset password
				</Button>
				<form method="POST" action="?/remove" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="csrf" value={data.csrf} />
					<input type="hidden" name="id" value={u.id} />
					<Button type="submit" variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive" aria-label="Delete {u.username}">
						<Trash2 />
					</Button>
				</form>
			</div>
		{/each}
	</Card.Root>
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New staff account</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => async ({ update, result }) => {
				await update({ reset: true });
				if (result.type === 'success') createOpen = false;
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="csrf" value={data.csrf} />
			<div class="grid gap-1.5">
				<Label for="u-name">Display name</Label>
				<Input id="u-name" name="displayName" required />
			</div>
			<div class="grid gap-1.5">
				<Label for="u-username">Username</Label>
				<Input id="u-username" name="username" required autocomplete="off" />
			</div>
			<div class="grid gap-1.5">
				<Label>Role</Label>
				<Select.Root type="single" name="role" bind:value={fRole}>
					<Select.Trigger class="w-full">{roleLabel[fRole]}</Select.Trigger>
					<Select.Content>
						<Select.Item value="counter" label="Counter staff">Counter staff</Select.Item>
						<Select.Item value="manager" label="Manager">Manager</Select.Item>
						<Select.Item value="admin" label="Administrator">Administrator</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-1.5">
				<Label for="u-pass">Password (min 8 chars)</Label>
				<Input id="u-pass" name="password" type="password" required minlength={8} />
			</div>
			<Button type="submit" class="w-full">Create account</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!resetFor} onOpenChange={(v) => { if (!v) resetFor = null; }}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Reset password for @{resetFor?.username}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/resetPassword"
			use:enhance={() => async ({ update, result }) => {
				await update({ reset: true });
				if (result.type === 'success') resetFor = null;
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="csrf" value={data.csrf} />
			<input type="hidden" name="id" value={resetFor?.id} />
			<Input name="password" type="password" required minlength={8} placeholder="New password" />
			<div class="flex gap-2">
				<Button type="button" variant="outline" class="flex-1" onclick={() => (resetFor = null)}>Cancel</Button>
				<Button type="submit" class="flex-1">Set password</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
