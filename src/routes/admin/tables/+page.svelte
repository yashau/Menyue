<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<h1 class="text-3xl font-semibold">Tables & QR tokens</h1>
<form method="POST" action="?/create" class="mt-5 flex gap-2">
	<Input name="label" placeholder="Table 1" required /><Button>Add table</Button>
</form>
{#if form?.newToken}<div class="mt-4 rounded bg-amber-100 p-4">
		Copy once: <code>{new URL('/t/' + form.newToken, 'http://localhost:5173').pathname}</code>
	</div>{/if}
<div class="mt-6 space-y-2">
	{#each data.tables as table}<div class="rounded bg-white p-3">
			{String(table.label)} · token ending {String(table.token_hint)} · {Number(table.enabled)
				? 'enabled'
				: 'disabled'}
			<form class="ml-3 inline" method="POST" action="?/toggle">
				<input type="hidden" name="id" value={String(table.id)} /><Button
					size="sm"
					variant="outline">Toggle</Button
				>
			</form>
			<form class="ml-2 inline" method="POST" action="?/rotate">
				<input type="hidden" name="id" value={String(table.id)} /><Button size="sm"
					>Rotate token</Button
				>
			</form>
		</div>{/each}
</div>
