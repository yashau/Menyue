<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onclose?: () => void;
		title?: string;
		labelledby?: string;
		describedby?: string;
		closeOnBackdrop?: boolean;
		closeOnEscape?: boolean;
		size?: 'sm' | 'md' | 'lg';
		fullOnMobile?: boolean;
		children: Snippet;
	}

	let {
		open = $bindable(),
		onclose,
		title,
		labelledby,
		describedby,
		closeOnBackdrop = true,
		closeOnEscape = true,
		size = 'md',
		fullOnMobile = true,
		children
	}: Props = $props();

	let panel = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	const sizes = {
		sm: 'sm:max-w-md',
		md: 'sm:max-w-lg',
		lg: 'sm:max-w-2xl'
	};

	function focusable(container: HTMLElement): HTMLElement[] {
		return Array.from(
			container.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => el.offsetParent !== null || el === document.activeElement);
	}

	function close() {
		onclose?.();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape' && closeOnEscape) {
			e.preventDefault();
			close();
			return;
		}
		if (e.key === 'Tab' && panel) {
			const items = focusable(panel);
			if (items.length === 0) {
				e.preventDefault();
				panel.focus();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement as HTMLElement;
			if (e.shiftKey && (active === first || active === panel)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	$effect(() => {
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';
			// focus after paint
			queueMicrotask(() => {
				if (!panel) return;
				const items = focusable(panel);
				(items[0] ?? panel).focus();
			});
			return () => {
				document.body.style.overflow = '';
				previouslyFocused?.focus?.();
			};
		}
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
		<!-- backdrop -->
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default bg-ink-900/55 backdrop-blur-[2px]"
			aria-label="Close dialog"
			tabindex="-1"
			onclick={() => closeOnBackdrop && close()}
		></button>

		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-label={labelledby ? undefined : title}
			aria-labelledby={labelledby}
			aria-describedby={describedby}
			tabindex="-1"
			class="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-sand-50 shadow-2xl outline-none
				{fullOnMobile ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl'}
				{sizes[size]}"
		>
			{@render children()}
		</div>
	</div>
{/if}
