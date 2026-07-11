<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { DisplayCurrency } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import ImageCropper from '$lib/components/ui/ImageCropper.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	let { data, form } = $props();

	let curOpen = $state(false);
	let editingCur = $state<DisplayCurrency | null>(null);

	let primary = $state(data.restaurant.theme.primary);
	let accent = $state(data.restaurant.theme.accent);
	let brandName = $state(data.restaurant.name);
	let logoKey = $state<string | null>(data.restaurant.logoKey);
	let logoCropperOpen = $state(false);

	// general form state
	let basePosition = $state<string>(data.restaurant.base.symbolPosition === 'after' ? 'after' : 'before');
	let conversionMode = $state<string>(data.restaurant.conversionMode === 'fixed' ? 'fixed' : 'api');
	let multiCurrency = $state(data.restaurant.multiCurrencyEnabled);
	let beverageEnabled = $state(data.restaurant.beveragePrompt.enabled);

	// currency dialog state
	let cPosition = $state('before');
	let cMode = $state('api');
	let cEnabled = $state(true);
	$effect(() => {
		if (!curOpen) return;
		cPosition = editingCur?.symbolPosition === 'after' ? 'after' : 'before';
		cMode = editingCur?.mode === 'fixed' ? 'fixed' : 'api';
		cEnabled = editingCur ? editingCur.enabled : true;
	});

	async function uploadLogo(blob: Blob) {
		const res = await fetch('/admin/media', {
			method: 'POST',
			headers: { 'content-type': blob.type || 'image/webp', 'x-csrf': data.csrf },
			body: blob
		});
		if (!res.ok) return;
		const body = (await res.json()) as { key: string };
		logoKey = body.key;
	}
	const presets = [
		{ name: 'Lagoon', primary: '#0d6d5b', accent: '#de5f34' },
		{ name: 'Sunset', primary: '#b23a48', accent: '#f2a154' },
		{ name: 'Indigo', primary: '#3b3b8f', accent: '#e0a458' },
		{ name: 'Charcoal', primary: '#2b2b2b', accent: '#c9a227' },
		{ name: 'Berry', primary: '#7a1f5c', accent: '#f28cb1' }
	];
	$effect(() => {
		if (form?.saved) toast.success('Settings saved');
	});

	const freshVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
		fresh: 'default',
		stale: 'secondary',
		fallback: 'destructive',
		fixed: 'outline'
	};
	const rateByCode = $derived(new Map(data.rates.map((r) => [r.code, r])));

	function fmtWhen(ts: number | null): string {
		if (!ts) return '—';
		const mins = Math.floor((Date.now() / 1000 - ts) / 60);
		if (mins < 60) return `${mins}m ago`;
		return `${Math.floor(mins / 60)}h ago`;
	}

	function newCurrency() {
		editingCur = null;
		curOpen = true;
	}
	function editCurrency(c: DisplayCurrency) {
		editingCur = c;
		curOpen = true;
	}
</script>

<svelte:head><title>Settings · Menyue admin</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-6 sm:px-6">
	<header class="mb-4">
		<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
		<p class="text-sm text-muted-foreground">Administrator-only. Revision {data.restaurant.settingsRevision}.</p>
	</header>

	{#if form?.refresh}
		<div
			class="mb-4 rounded-lg border px-3 py-2 text-sm {form.refresh.ok
				? 'border-border bg-muted text-foreground'
				: 'border-destructive/30 bg-destructive/10 text-destructive'}"
		>
			{#if form.refresh.ok}Rates refreshed via {form.refresh.provider}: {form.refresh.updated.join(', ')}{:else}Refresh:
				{form.refresh.reason} (still serving cached / fallback rates){/if}
		</div>
	{/if}

	<!-- Brand & appearance -->
	<Card.Root class="mb-5">
		<Card.Header>
			<Card.Title>Brand &amp; appearance</Card.Title>
			<Card.Description>
				Your primary and accent colours re-skin the customer menu. Changes apply after saving. (The admin and
				counter always use a neutral theme.)
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/saveTheme"
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="flex flex-col gap-4"
			>
				<input type="hidden" name="csrf" value={data.csrf} />
				<input type="hidden" name="logoKey" value={logoKey ?? ''} />

				<div class="flex flex-wrap items-end gap-4">
					<div class="grid gap-1.5">
						<Label for="brand-name">Restaurant name</Label>
						<Input id="brand-name" name="name" bind:value={brandName} required class="w-64" />
					</div>
					<div class="flex items-center gap-3">
						{#if logoKey}
							<img src={`/media/${logoKey}`} alt="" class="size-11 rounded-md object-cover" />
						{:else}
							<span class="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">Logo</span>
						{/if}
						<div class="flex flex-col items-start gap-1">
							<Button type="button" variant="secondary" size="sm" onclick={() => (logoCropperOpen = true)}>
								<Plus /> {logoKey ? 'Change logo' : 'Upload logo'}
							</Button>
							{#if logoKey}
								<Button type="button" variant="link" size="sm" class="h-auto p-0 text-destructive" onclick={() => (logoKey = null)}>
									Remove logo
								</Button>
							{:else}
								<span class="text-xs text-muted-foreground">Default leaf mark</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2">
						<input type="color" name="primary" bind:value={primary} class="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent" />
						<div>
							<div class="text-xs font-medium">Primary</div>
							<div class="font-mono text-xs text-muted-foreground">{primary}</div>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<input type="color" name="accent" bind:value={accent} class="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent" />
						<div>
							<div class="text-xs font-medium">Accent</div>
							<div class="font-mono text-xs text-muted-foreground">{accent}</div>
						</div>
					</div>
					<div class="flex items-center gap-2">
						{#each presets as p (p.name)}
							<button
								type="button"
								onclick={() => {
									primary = p.primary;
									accent = p.accent;
								}}
								class="size-9 rounded-full border-2 border-background shadow ring-1 ring-border"
								style="background: linear-gradient(135deg, {p.primary} 55%, {p.accent} 55%)"
								aria-label="Preset {p.name}"
								title={p.name}
							></button>
						{/each}
					</div>
				</div>

				<!-- live preview of the customer menu colours -->
				<div class="flex items-center gap-3 rounded-lg p-3" style="background:{primary}">
					<span class="rounded-full px-3 py-1.5 text-sm font-semibold" style="background:{accent}; color:#fff">Accent</span>
					<span class="text-lg font-semibold text-white">Aa — your brand</span>
					<span class="ml-auto rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium" style="color:{primary}">Button</span>
				</div>
				<div><Button type="submit">Save brand</Button></div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- General -->
	<Card.Root class="mb-5">
		<Card.Header><Card.Title>Base currency &amp; conversion</Card.Title></Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/saveGeneral"
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="grid grid-cols-2 gap-3 sm:grid-cols-3"
			>
				<input type="hidden" name="csrf" value={data.csrf} />
				<div class="grid gap-1.5">
					<Label for="base-code">Base code</Label>
					<Input id="base-code" name="baseCode" value={data.restaurant.base.code} />
				</div>
				<div class="grid gap-1.5">
					<Label for="base-symbol">Symbol</Label>
					<Input id="base-symbol" name="baseSymbol" value={data.restaurant.base.symbol} />
				</div>
				<div class="grid gap-1.5">
					<Label for="base-precision">Precision</Label>
					<Input id="base-precision" name="basePrecision" type="number" min={0} max={4} value={data.restaurant.base.precision} />
				</div>
				<div class="grid gap-1.5">
					<Label>Symbol position</Label>
					<Select.Root type="single" name="basePosition" bind:value={basePosition}>
						<Select.Trigger class="w-full">{basePosition === 'after' ? 'After (100 Rf)' : 'Before (Rf100)'}</Select.Trigger>
						<Select.Content>
							<Select.Item value="before" label="Before (Rf100)">Before (Rf100)</Select.Item>
							<Select.Item value="after" label="After (100 Rf)">After (100 Rf)</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-1.5">
					<Label>Conversion mode</Label>
					<Select.Root type="single" name="conversionMode" bind:value={conversionMode}>
						<Select.Trigger class="w-full">{conversionMode === 'fixed' ? 'Fixed rates only' : 'API (live rates)'}</Select.Trigger>
						<Select.Content>
							<Select.Item value="api" label="API (live rates)">API (live rates)</Select.Item>
							<Select.Item value="fixed" label="Fixed rates only">Fixed rates only</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
				<div class="flex items-end gap-2 pb-2">
					<Switch id="multi-cur" name="multiCurrency" value="on" bind:checked={multiCurrency} />
					<Label for="multi-cur">Multi-currency</Label>
				</div>
				<div class="col-span-2 sm:col-span-3"><Button type="submit">Save base settings</Button></div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Exchange status -->
	<Card.Root class="mb-5">
		<Card.Header class="flex-row items-center justify-between">
			<Card.Title>Exchange rate status</Card.Title>
			<form method="POST" action="?/refreshRates" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<input type="hidden" name="csrf" value={data.csrf} />
				<Button type="submit" variant="outline" size="sm"><RefreshCw /> Refresh now</Button>
			</form>
		</Card.Header>
		<Card.Content>
			<p class="mb-3 text-xs text-muted-foreground">
				Rates are cached and fresh for {data.windows.freshHours}h, usable up to {data.windows.maxHours}h, then fixed
				fallback rates apply. Provider is a fixed allowlisted service.
			</p>
			<div class="flex flex-col gap-1.5">
				{#each data.currencies.filter((c) => c.enabled) as c (c.code)}
					{@const r = rateByCode.get(c.code)}
					<div class="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
						<span class="font-medium">{c.code}</span>
						<span class="text-muted-foreground">1 {data.restaurant.base.code} = {r?.rate ?? c.fallbackRate} {c.code}</span>
						<span class="text-xs text-muted-foreground">{r ? fmtWhen(r.fetchedAt) : '—'} · {r?.provider}</span>
						<Badge variant={freshVariant[r?.freshness ?? 'fallback']}>{r?.freshness ?? 'fallback'}</Badge>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Display currencies -->
	<Card.Root class="mb-5">
		<Card.Header class="flex-row items-center justify-between">
			<Card.Title>Display currencies</Card.Title>
			<Button size="sm" onclick={newCurrency}><Plus /> Add</Button>
		</Card.Header>
		<Card.Content>
			<div class="overflow-hidden rounded-lg border border-border">
				{#each data.currencies as c (c.id)}
					<div class="flex items-center gap-2 border-b border-border p-2.5 last:border-0">
						<span class="w-12 font-semibold">{c.code}</span>
						<span class="flex-1 text-xs text-muted-foreground">
							{c.mode} · fallback {c.fallbackRate}{c.fixedRate ? ` · fixed ${c.fixedRate}` : ''} · {c.enabled
								? 'enabled'
								: 'disabled'}
						</span>
						<Button variant="ghost" size="icon" onclick={() => editCurrency(c)} aria-label="Edit {c.code}"><Pencil /></Button>
						<form method="POST" action="?/removeCurrency" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="csrf" value={data.csrf} />
							<input type="hidden" name="id" value={c.id} />
							<Button type="submit" variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive" aria-label="Delete {c.code}"><Trash2 /></Button>
						</form>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Beverage prompt -->
	<Card.Root class="mb-5">
		<Card.Header><Card.Title>Final beverage prompt</Card.Title></Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<form
				method="POST"
				action="?/saveBeverage"
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="flex flex-col gap-3"
			>
				<input type="hidden" name="csrf" value={data.csrf} />
				<div class="flex items-center gap-2">
					<Switch id="bev-enabled" name="enabled" value="on" bind:checked={beverageEnabled} />
					<Label for="bev-enabled">Show the beverage prompt before submission</Label>
				</div>
				<div class="grid gap-1.5">
					<Label for="bev-heading">Heading</Label>
					<Input id="bev-heading" name="heading" value={data.restaurant.beveragePrompt.heading} />
				</div>
				<div class="grid gap-1.5">
					<Label for="bev-body">Supporting copy</Label>
					<Textarea id="bev-body" name="body" rows={2} value={data.restaurant.beveragePrompt.body} />
				</div>
				<div class="grid gap-1.5">
					<Label for="bev-skip">Skip button label</Label>
					<Input id="bev-skip" name="skipLabel" value={data.restaurant.beveragePrompt.skipLabel} />
				</div>
				<div>
					<div class="mb-1.5 text-sm font-medium">Eligible beverage categories</div>
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{#each data.categories as cat (cat.id)}
							<Label class="flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 font-normal">
								<Checkbox name="cat_{cat.id}" value="on" checked={data.beverageCategoryIds.includes(cat.id)} />
								{cat.name}
							</Label>
						{/each}
					</div>
				</div>
				<Button type="submit">Save beverage prompt</Button>
			</form>

			<div class="border-t border-border pt-3">
				<div class="mb-2 text-sm font-medium">Specific beverage / water items</div>
				<div class="mb-2 flex flex-wrap gap-1.5">
					{#each data.beverageItems as bi (bi.item_id)}
						<span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
							{bi.name}
							<form method="POST" action="?/removeBeverageItem" use:enhance={() => async ({ update }) => update({ reset: false })} class="inline">
								<input type="hidden" name="csrf" value={data.csrf} />
								<input type="hidden" name="itemId" value={bi.item_id} />
								<button class="text-destructive" aria-label="Remove">×</button>
							</form>
						</span>
					{/each}
				</div>
				<form method="POST" action="?/addBeverageItem" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex gap-2">
					<input type="hidden" name="csrf" value={data.csrf} />
					<select name="itemId" class="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm">
						{#each data.drinkItems as di (di.id)}<option value={di.id}>{di.name}</option>{/each}
					</select>
					<Button type="submit" variant="secondary">Add item</Button>
				</form>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<ImageCropper bind:open={logoCropperOpen} aspect={1} title="Restaurant logo" onclose={() => (logoCropperOpen = false)} onapply={uploadLogo} />

<Dialog.Root bind:open={curOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editingCur ? `Edit ${editingCur.code}` : 'Add currency'}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/saveCurrency"
			use:enhance={() => async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') curOpen = false;
			}}
			class="grid grid-cols-2 gap-3"
		>
			<input type="hidden" name="csrf" value={data.csrf} />
			{#if editingCur}<input type="hidden" name="id" value={editingCur.id} />{/if}
			<div class="grid gap-1.5">
				<Label for="c-code">Code</Label>
				<Input id="c-code" name="code" value={editingCur?.code ?? ''} required />
			</div>
			<div class="grid gap-1.5">
				<Label for="c-symbol">Symbol</Label>
				<Input id="c-symbol" name="symbol" value={editingCur?.symbol ?? ''} required />
			</div>
			<div class="grid gap-1.5">
				<Label for="c-precision">Precision</Label>
				<Input id="c-precision" name="precision" type="number" min={0} max={4} value={editingCur?.precision ?? 2} />
			</div>
			<div class="grid gap-1.5">
				<Label>Position</Label>
				<Select.Root type="single" name="position" bind:value={cPosition}>
					<Select.Trigger class="w-full capitalize">{cPosition}</Select.Trigger>
					<Select.Content>
						<Select.Item value="before" label="Before">Before</Select.Item>
						<Select.Item value="after" label="After">After</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-1.5">
				<Label>Mode</Label>
				<Select.Root type="single" name="mode" bind:value={cMode}>
					<Select.Trigger class="w-full uppercase">{cMode}</Select.Trigger>
					<Select.Content>
						<Select.Item value="api" label="API">API</Select.Item>
						<Select.Item value="fixed" label="Fixed">Fixed</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-1.5">
				<Label for="c-order">Display order</Label>
				<Input id="c-order" name="displayOrder" type="number" value={editingCur?.displayOrder ?? 0} />
			</div>
			<div class="grid gap-1.5">
				<Label for="c-fixed">Fixed rate (optional)</Label>
				<Input id="c-fixed" name="fixedRate" type="number" step="0.0001" value={editingCur?.fixedRate ?? ''} />
			</div>
			<div class="grid gap-1.5">
				<Label for="c-fallback">Fallback rate</Label>
				<Input id="c-fallback" name="fallbackRate" type="number" step="0.0001" value={editingCur?.fallbackRate ?? 1} />
			</div>
			<div class="col-span-2 flex items-center gap-2">
				<Switch id="c-enabled" name="enabled" value="on" bind:checked={cEnabled} />
				<Label for="c-enabled">Enabled</Label>
			</div>
			<div class="col-span-2"><Button type="submit" class="w-full">Save currency</Button></div>
		</form>
	</Dialog.Content>
</Dialog.Root>
