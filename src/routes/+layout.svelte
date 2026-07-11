<script lang="ts">
	import '../app.css';
	import { buildThemeVars } from '$lib/theme';
	let { children, data } = $props();
	// Inline custom properties on a display:contents wrapper override the
	// :root defaults for the entire subtree without affecting layout.
	const themeVars = $derived(buildThemeVars(data.theme));
</script>

<div style="display:contents; {themeVars}">
	{@render children()}
</div>
