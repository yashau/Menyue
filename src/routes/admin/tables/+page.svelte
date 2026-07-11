<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	let { data } = $props();

	// Prefer the live browser origin for copy links (never 0.0.0.0 in a browser).
	let clientOrigin = $state(data.linkOrigin);
	$effect(() => {
		if (typeof window !== 'undefined') clientOrigin = window.location.origin.replace('0.0.0.0', 'localhost');
	});
	const linkFor = (token: string) => `${clientOrigin}/t/${token}`;

	let copied = $state<number | null>(null);
	async function copy(id: number, token: string) {
		try {
			await navigator.clipboard.writeText(linkFor(token));
			copied = id;
			setTimeout(() => (copied = null), 1500);
		} catch {
			copied = null;
		}
	}
</script>

<svelte:head><title>Tables · Menyue admin</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<header class="mb-4">
		<h1 class="text-2xl font-semibold tracking-tight">Tables</h1>
		<p class="text-sm text-muted-foreground">
			Each table has an opaque ordering link. Links use <span class="font-mono text-foreground">{clientOrigin}</span>
		</p>
	</header>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => async ({ update }) => update({ reset: true })}
		class="mb-4 flex gap-2"
	>
		<input type="hidden" name="csrf" value={data.csrf} />
		<Input name="label" placeholder="New table label, e.g. Terrace 4" required class="flex-1" />
		<Button type="submit"><Plus /> Add table</Button>
	</form>

	<Card.Root class="gap-0 py-0">
		{#each data.tables as t (t.id)}
			<div class="flex flex-wrap items-center gap-3 border-b border-border p-3 last:border-0" data-testid="table-row">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="font-medium">{t.label}</span>
						{#if t.enabled}
							<Badge variant="secondary">active</Badge>
						{:else}
							<Badge variant="outline">disabled</Badge>
						{/if}
					</div>
					<div class="truncate font-mono text-xs text-muted-foreground" data-testid="table-link">{linkFor(t.token)}</div>
				</div>
				<div class="flex items-center gap-1.5">
					<Button variant="outline" size="sm" onclick={() => copy(t.id, t.token)}>
						{#if copied === t.id}<Check /> Copied{:else}<Copy /> Copy link{/if}
					</Button>
					<Button href={linkFor(t.token)} target="_blank" rel="noopener" variant="outline" size="sm">
						<ExternalLink /> Open
					</Button>
					<form method="POST" action="?/toggle" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="csrf" value={data.csrf} />
						<input type="hidden" name="id" value={t.id} />
						<input type="hidden" name="value" value={t.enabled ? '0' : '1'} />
						<Button type="submit" variant="outline" size="sm">{t.enabled ? 'Disable' : 'Enable'}</Button>
					</form>
					<form method="POST" action="?/remove" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="csrf" value={data.csrf} />
						<input type="hidden" name="id" value={t.id} />
						<Button type="submit" variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive" aria-label="Delete {t.label}">
							<Trash2 />
						</Button>
					</form>
				</div>
			</div>
		{/each}
	</Card.Root>
</div>
