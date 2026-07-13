<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Users & roles</h1>
		<p class="text-muted-foreground">Create staff accounts and manage their access.</p>
	</div>
	<Card
		><CardHeader
			><CardTitle>Create user</CardTitle><CardDescription
				>New users must replace their temporary password.</CardDescription
			></CardHeader
		><CardContent
			><form method="POST" action="?/create" class="grid gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="username">Username</Label><Input id="username" name="username" required />
				</div>
				<div class="space-y-2">
					<Label for="name">Display name</Label><Input id="name" name="name" required />
				</div>
				<div class="space-y-2">
					<Label for="password">Temporary password</Label><Input
						id="password"
						name="password"
						type="password"
						required
					/>
				</div>
				<div class="space-y-2">
					<Label>Role</Label><Select.Root type="single" name="role" value="admin"
						><Select.Trigger aria-label="Role" class="w-full">Select a role</Select.Trigger><Select.Content
							><Select.Item value="admin">Admin</Select.Item><Select.Item value="manager"
								>Manager</Select.Item
							></Select.Content
						></Select.Root
					>
				</div>
				<Button type="submit" class="md:col-span-2 md:w-fit">Create</Button>
			</form></CardContent
		></Card
	>
	<div class="space-y-4">
		{#each data.users as u}<Card
				><CardHeader
					><CardTitle>{String(u.display_name)}</CardTitle><CardDescription
						>Update access or issue a new temporary password.</CardDescription
					></CardHeader
				><CardContent class="space-y-4"
					><form method="POST" action="?/update" class="flex flex-wrap items-end gap-4">
						<input type="hidden" name="id" value={String(u.id)} />
						<div class="space-y-2">
							<Label>Role</Label><Select.Root type="single" name="role" value={String(u.role)}
								><Select.Trigger aria-label="Role for {String(u.display_name)}" class="w-36">{String(u.role)}</Select.Trigger><Select.Content
									><Select.Item value="admin">Admin</Select.Item><Select.Item value="manager"
										>Manager</Select.Item
									></Select.Content
								></Select.Root
							>
						</div>
						<Label class="flex h-9 items-center gap-2"
							><Switch name="enabled" checked={Number(u.enabled) === 1} /> Enabled</Label
						><Button type="submit" size="sm">Save</Button>
					</form>
					<form method="POST" action="?/reset" class="flex max-w-lg gap-2">
						<input type="hidden" name="id" value={String(u.id)} /><Input
							name="password"
							type="password"
							placeholder="New temporary password"
							aria-label="New temporary password for {String(u.display_name)}"
							required
						/><Button type="submit" size="sm" variant="outline">Reset password</Button>
					</form></CardContent
				></Card
			>{/each}
	</div>
</div>
