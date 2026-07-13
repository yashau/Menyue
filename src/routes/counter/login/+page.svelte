<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData | null } = $props();
</script>

<svelte:head><title>Counter access · Menyue</title></svelte:head>

<main class="counter-login">
	<form method="POST">
		<a class="wordmark" href="/">MENYUE</a>
		<p class="eyebrow">Counter access</p>
		<h1>Service board</h1>
		<p>Sign in with your counter operator account to open the live kitchen feed.</p>
		{#if form?.message}<p id="counter-login-error" class="auth-error" role="alert">{form.message}</p>{/if}
		<label for="username">Username</label>
		<input id="username" name="username" autocomplete="username" />
		<label for="password">Password</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required aria-invalid={form?.message ? 'true' : undefined} aria-describedby={form?.message ? 'counter-login-error' : undefined} />
		<button type="submit">Open board <span aria-hidden="true">→</span></button>
	</form>
</main>
