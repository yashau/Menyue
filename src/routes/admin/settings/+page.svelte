<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { accessibleForeground, normalizeBrandColor } from '$lib/branding';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	let enabled = $state(Boolean(data.settings?.display_enabled));
	let mode = $state(data.settings?.rate_mode ?? 'fixed');
	let previewPrimary = $state('');
	let previewAccent = $state('');
	$effect(() => {
		if (!previewPrimary) previewPrimary = data.branding.primary;
		if (!previewAccent) previewAccent = data.branding.accent;
	});
	const safePreviewPrimary = $derived(normalizeBrandColor(previewPrimary) ?? data.branding.primary);
	const safePreviewAccent = $derived(normalizeBrandColor(previewAccent) ?? data.branding.accent);
	const when = (epoch: number | null) => epoch ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epoch * 1000)) : 'Not yet available';
</script>

<svelte:head><title>Currency settings — Menyue</title></svelte:head>
<div class="max-w-3xl space-y-6">
	<Badge variant="secondary">Restaurant settings</Badge>
	<h1 class="mt-3 text-3xl font-semibold tracking-tight">Currency & display</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		Prices and orders always stay in the restaurant base currency. A guest-facing quote is
		presentation only.
	</p>
	<Card class="mt-8">
		<CardHeader><CardTitle>Customer branding</CardTitle></CardHeader>
		<CardContent>
			<form method="POST" action="?/branding" enctype="multipart/form-data" class="grid gap-5">
				<p class="text-sm text-muted-foreground">The restaurant name comes from Editorial content. These controls affect customer menus only; counter and admin screens keep their operational themes.</p>
				<div class="grid gap-2"><Label for="logo">Logo</Label><Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="logo-description" /><p id="logo-description" class="text-sm text-muted-foreground">JPEG, PNG, or WebP under 5 MB. The uploaded asset remains scoped to this restaurant.</p></div>
				<div class="grid gap-4 sm:grid-cols-2"><div class="grid gap-2"><Label for="primaryColor">Primary colour</Label><Input id="primaryColor" name="primaryColor" bind:value={previewPrimary} pattern="#[0-9A-Fa-f]{6}" maxlength={7} required /></div><div class="grid gap-2"><Label for="accentColor">Accent colour</Label><Input id="accentColor" name="accentColor" bind:value={previewAccent} pattern="#[0-9A-Fa-f]{6}" maxlength={7} required /></div></div>
				<div data-testid="customer-brand-preview" class="rounded-lg border p-4" style:--preview-primary={safePreviewPrimary} style:--preview-primary-foreground={accessibleForeground(safePreviewPrimary)} style:--preview-accent={safePreviewAccent} style:--preview-accent-foreground={accessibleForeground(safePreviewAccent)}>
					<div class="flex flex-wrap items-center gap-3"><span class="brand-preview-logo">{data.branding.title.slice(0, 1)}</span><div><p class="font-semibold">{data.branding.title}</p><p class="text-sm text-muted-foreground">Customer-menu preview</p></div><span class="brand-preview-accent">Accent</span></div>
				</div>
				{#if form?.brandingMessage}<p class="text-sm text-destructive" role="alert">{form.brandingMessage}</p>{/if}{#if form?.brandingSaved}<p class="text-sm text-primary" role="status">Customer branding saved.</p>{/if}
				<Button type="submit" class="w-fit">Save customer branding</Button>
			</form>
		</CardContent>
	</Card>
	<Card class="mt-8">
		<CardHeader><CardTitle>Global money settings</CardTitle></CardHeader>
		<CardContent>
			<form method="POST" action="?/save" class="grid gap-6">
				<div class="grid gap-2">
					<Label for="baseCurrency">Base currency</Label><Input
						id="baseCurrency"
						name="baseCurrency"
					aria-describedby="baseCurrency-description"
					value={data.baseCurrency}
					maxlength={3}
					class="uppercase"
					readonly
				/>
					<p id="baseCurrency-description" class="text-sm text-muted-foreground">
						Managed by the confirmed Make base action below; existing order snapshots are never
						rewritten.
					</p>
				</div>
				<div class="flex items-center justify-between gap-4 rounded-lg border p-4">
					<div>
						<Label for="displayEnabled">Show a guest currency switcher</Label>
						<p class="text-sm text-muted-foreground">
							Only appears when a valid quote is available.
						</p>
					</div>
					<Switch id="displayEnabled" name="displayEnabled" bind:checked={enabled} />
				</div>
				{#if enabled}<div class="grid gap-5 rounded-lg border p-4">
						<div class="grid gap-2">
							<Label for="displayCurrency">Display currency</Label><Input
								id="displayCurrency"
								name="displayCurrency"
								value={data.settings?.display_currency ?? ''}
								maxlength={3}
								class="uppercase"
								required
							/>
						</div>
						<fieldset class="grid gap-2">
							<legend class="text-sm font-medium">Rate source</legend><label class="flex gap-2"
								><input type="radio" name="rateMode" value="fixed" bind:group={mode} /> Fixed rate</label
							><label class="flex gap-2"
								><input type="radio" name="rateMode" value="api" bind:group={mode} /> Exchange Rate API
								(cached)</label
							>
						</fieldset>
						<div class="grid gap-2">
							<Label for="fixedRate">Fixed fallback rate</Label><Input
								id="fixedRate"
								name="fixedRate"
								aria-describedby="fixedRate-description"
								inputmode="decimal"
								value={data.fixedRate}
								placeholder="e.g. 0.065"
								required
							/>
							<p id="fixedRate-description" class="text-sm text-muted-foreground">
								One display-currency unit per base-currency unit. Required as a safe API fallback.
							</p>
						</div>
					</div>{:else}<input type="hidden" name="displayCurrency" value="USD" /><input
						type="hidden"
						name="fixedRate"
						value="1"
					/>{/if}
				{#if form?.message}<p class="text-sm text-destructive" role="alert">
						{form.message}
					</p>{/if}{#if form?.saved}<p class="text-sm text-primary" role="status">Settings saved.</p>{/if}<Button type="submit"
					class="w-fit">Save publishing settings</Button
				>
			</form>
		</CardContent>
	</Card>
	<Card class="mt-6"
		><CardHeader><CardTitle>Guest currencies</CardTitle></CardHeader><CardContent class="space-y-4"
			><p class="text-sm text-muted-foreground">
				Quotes are estimates only; orders and snapshots always retain their authoritative base
				amount.
			</p>
			<section class="space-y-3 rounded-lg border p-4" aria-labelledby="currency-health-title">
				<div><h2 id="currency-health-title" class="font-medium">Currency health</h2><p class="text-sm text-muted-foreground">Base: {data.baseCurrency}. Only enabled currencies appear below; a guest quote never changes the order currency.</p></div>
				{#each data.currencyHealth as health}
					<div class="grid gap-1 border-t pt-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
						<Badge variant="outline">{health.code}</Badge>
						<div class="text-sm"><p>{health.source === 'exchange-rate-api' ? 'Exchange Rate API' : health.source === 'fixed' ? 'Fixed rate' : 'Restaurant base currency'} · {health.status}</p><p class="text-muted-foreground">Last successful refresh/update: {when(health.updatedAt)}</p></div>
						<p class="text-xs text-muted-foreground sm:max-w-56">{health.orderingImpact}</p>
					</div>
				{/each}
			</section>
			<form method="POST" action="?/sync" class="flex flex-wrap items-center gap-3">
				<Button type="submit" variant="outline">Refresh API rates now</Button>
				{#if form?.synced !== undefined}<p class="text-sm text-primary" role="status">
					Synced {form.synced} rate{form.synced === 1 ? '' : 's'}.
				</p>{/if}
			</form>
			<form method="POST" action="?/currency" class="grid gap-2 md:grid-cols-5">
				<Label class="sr-only" for="currency-code">Currency code</Label><Input
					id="currency-code"
					name="code"
					maxlength={3}
					placeholder="USD"
					required
				/><Label class="sr-only" for="currency-minor-unit">Minor units</Label><Input
					id="currency-minor-unit"
					name="minorUnit"
					type="number"
					min="0"
					max="4"
					value="2"
				/><Label class="sr-only" for="currency-locale">Locale</Label><Input
					id="currency-locale"
					name="locale"
					placeholder="en-US"
					value="en"
				/><Select.Root
					type="single"
					name="mode"
					value="fixed"
					><Select.Trigger aria-label="Rate source" class="w-full">fixed</Select.Trigger><Select.Content
						><Select.Item value="fixed">Fixed rate</Select.Item><Select.Item value="api"
							>Cached API</Select.Item
						></Select.Content
					></Select.Root
				><Label class="sr-only" for="currency-fixed-rate">Fixed exchange rate</Label><Input
					id="currency-fixed-rate"
					name="fixedRate"
					inputmode="decimal"
					placeholder="rate"
					value="1"
					required
				/><Button type="submit"
					class="w-fit">Save quote</Button
				>
			</form>
			{#each data.currencies as currency}<div
					class="flex flex-wrap items-center gap-2 rounded-lg border p-3"
				>
					<Badge variant="outline">{String(currency.currency_code)}</Badge><span
						class="text-sm text-muted-foreground"
						>{Number(currency.minor_unit)} decimals · {String(currency.rate_mode)}
						{Number(currency.is_base) ? '· Base' : ''}</span
					>{#if !Number(currency.is_base)}<form method="POST" action="?/removeCurrency">
							<input type="hidden" name="code" value={String(currency.currency_code)} /><Button type="submit"
								size="sm"
								variant="destructive">Remove</Button
							>
						</form>
						<form method="POST" action="?/makeBase" class="flex gap-2">
							<input type="hidden" name="code" value={String(currency.currency_code)} /><Input
								name="confirm"
								aria-label={`Type ${String(currency.currency_code)} to confirm`}
								placeholder={`Type ${String(currency.currency_code)}`}
							/><Button type="submit" size="sm" variant="outline">Make base</Button>
						</form>{/if}
				</div>{/each}</CardContent
		></Card
	>
	<Card class="mt-6"
		><CardHeader><CardTitle>Final drinks prompt</CardTitle></CardHeader><CardContent>
			<form method="POST" action="?/beverage" class="grid gap-4">
				<label class="flex items-center gap-2"
					><Switch name="enabled" checked={Boolean(data.beverage?.enabled)} /> Ask before sending when
					no selected drink is in the cart</label
				><label class="grid gap-1"
					>Heading<Input
						name="heading"
						value={data.beverage?.heading ?? 'Something to drink?'}
						required
					/></label
				><label class="grid gap-1"
					>Copy<Textarea
						name="body"
						value={String(data.beverage?.body ?? 'Add a drink before we send your order.')}
					/></label
				><label class="grid gap-1"
					>Skip label<Input
						name="skipLabel"
						value={data.beverage?.skip_label ?? 'No thanks, send order'}
						required
					/></label
				>
				<fieldset class="grid gap-2">
					<legend class="font-medium">Eligible categories</legend
					>{#each data.categoryTargets as category}<label class="flex items-center gap-2"
							><Switch
								name="categoryId"
								value={String(category.id)}
								checked={data.beverageCategories.includes(String(category.id))}
							/>
							{String(category.name)}</label
						>{/each}
				</fieldset>
				<fieldset class="grid gap-2">
					<legend class="font-medium">Eligible drinks</legend
					>{#each data.menuTargets as target}<label class="flex items-center gap-2"
							><Switch
								name="itemId"
								value={String(target.id)}
								checked={data.beverageItems.includes(String(target.id))}
							/>
							{String(target.name)}
							<span class="text-muted-foreground">· {String(target.category)}</span></label
						>{/each}
				</fieldset>
				<Button type="submit" class="w-fit">Save drinks prompt</Button>{#if form?.beverageSaved}<p
					class="text-sm text-primary"
					role="status"
					>
						Drinks prompt saved.
					</p>{/if}
			</form>
		</CardContent></Card
	>
</div>

<style>
	.brand-preview-logo, .brand-preview-accent { background: var(--preview-primary); color: var(--preview-primary-foreground); border-radius: 999px; padding: 0.35rem 0.65rem; font-weight: 700; }
	.brand-preview-accent { background: var(--preview-accent); color: var(--preview-accent-foreground); }
</style>
