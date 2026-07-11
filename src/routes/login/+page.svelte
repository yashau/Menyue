<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BrandMark from '$lib/components/ui/BrandMark.svelte';

	let { form, data } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · Menyue</title></svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-gradient-to-br from-lagoon-800 to-ink-900 p-4">
	<div class="w-full max-w-sm rounded-2xl bg-sand-50 p-6 shadow-2xl sm:p-8">
		<div class="mb-6 flex flex-col items-center text-center">
			<BrandMark logoKey={data.brand.logoKey} size={52} />
			<h1 class="mt-3 font-display text-2xl font-bold text-ink-800">{data.brand.name}</h1>
			<p class="text-sm text-ink-400">Staff sign in</p>
		</div>

		{#if form?.error}
			<div class="mb-4 flex items-center gap-2 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-700" role="alert">
				<Icon name="alert" size={16} /> {form.error}
			</div>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="flex flex-col gap-3"
		>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-ink-600">Username</span>
				<input
					name="username"
					autocomplete="username"
					value={form?.username ?? ''}
					required
					class="h-11 rounded-lg border border-ink-600/15 bg-sand-50 px-3 text-sm focus-visible:outline-2 focus-visible:outline-lagoon-500"
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-ink-600">Password</span>
				<input
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="h-11 rounded-lg border border-ink-600/15 bg-sand-50 px-3 text-sm focus-visible:outline-2 focus-visible:outline-lagoon-500"
				/>
			</label>
			<Button type="submit" variant="primary" size="lg" full disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>

		<div class="mt-5 rounded-lg bg-sand-100 p-3 text-xs text-ink-500">
			<div class="mb-1 font-semibold text-ink-600">Demo accounts</div>
			<div class="grid grid-cols-1 gap-0.5">
				<span>admin / menyue-admin</span>
				<span>manager / menyue-manager</span>
				<span>counter / menyue-counter</span>
			</div>
		</div>
	</div>
</div>
