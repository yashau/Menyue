<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		full?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		full = false,
		class: klass = '',
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 select-none';
	const variants = {
		primary: 'bg-lagoon-600 text-sand-50 hover:bg-lagoon-700 active:bg-lagoon-800',
		accent: 'bg-coral-500 text-sand-50 hover:bg-coral-600 active:bg-coral-700',
		outline: 'border border-ink-600/25 bg-sand-50 text-ink-800 hover:bg-sand-100',
		ghost: 'text-ink-700 hover:bg-ink-600/8',
		danger: 'bg-coral-600 text-sand-50 hover:bg-coral-700'
	};
	const sizes = {
		sm: 'h-9 px-4 text-sm',
		md: 'min-h-11 px-5 text-sm',
		lg: 'min-h-12 px-6 text-base'
	};
</script>

<button
	class="{base} {variants[variant]} {sizes[size]} {full ? 'w-full' : ''} {klass}"
	{...rest}
>
	{@render children()}
</button>
