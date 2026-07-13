<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Tables & QR tokens</h1>
		<p class="text-muted-foreground">Manage table links and rotate access tokens.</p>
	</div>
	<Card
		><CardHeader
			><CardTitle>Add table</CardTitle><CardDescription>Create a new table link.</CardDescription
			></CardHeader
		><CardContent
			><form method="POST" action="?/create" class="flex max-w-lg gap-2">
				<Label class="sr-only" for="new-table-label">Table label</Label><Input
					id="new-table-label"
					name="label"
					placeholder="Table 1"
					required
				/><Button type="submit">Add table</Button>
			</form></CardContent
		></Card
	>
	{#if form?.newToken}<Card
			><CardHeader
				><CardTitle>New token</CardTitle><CardDescription
					>This link is shown only once. Copy it now.</CardDescription
				></CardHeader
			><CardContent
				><code class="text-sm break-all"
					>{new URL('/t/' + form.newToken, 'http://localhost:5173').pathname}</code
				></CardContent
			></Card
		>{/if}
	<div class="space-y-4">
		{#each data.tables as table}<Card
				><CardContent
					class="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between"
					><div>
						<div class="font-medium">{String(table.label)}</div>
						<div class="text-sm text-muted-foreground">Token ending {String(table.token_hint)}</div>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant={Number(table.enabled) ? 'default' : 'secondary'}
							>{Number(table.enabled) ? 'Enabled' : 'Disabled'}</Badge
						>
						<form method="POST" action="?/toggle">
							<input type="hidden" name="id" value={String(table.id)} /><Button type="submit"
								size="sm"
								variant="outline">Toggle</Button
							>
						</form>
						<form method="POST" action="?/rotate">
							<input type="hidden" name="id" value={String(table.id)} /><Button type="submit" size="sm"
								>Rotate token</Button
							>
						</form>
					</div></CardContent
				></Card
			>{/each}
	</div>
</div>
