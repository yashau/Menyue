<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<!-- The watcher emits a head script before first paint and keeps `html.dark` in sync with the OS. -->
<ModeWatcher
	defaultMode="system"
	themeColors={{ light: '#f7f8ff', dark: '#171a2c' }}
	disableTransitions={true}
	synchronousModeChanges={true}
/>
{@render children()}
