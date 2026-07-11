<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		open: boolean;
		orderNumber: string;
		tableLabel: string;
		onclose: () => void;
	}
	let { open = $bindable(), orderNumber, tableLabel, onclose }: Props = $props();
</script>

<Dialog {open} {onclose} size="sm" closeOnBackdrop={false} title="Order sent">
	<div class="flex flex-col items-center px-6 pb-safe-4 pt-8 text-center">
		<div class="flex h-16 w-16 items-center justify-center rounded-full bg-lagoon-100 text-lagoon-700">
			<Icon name="check" size={34} />
		</div>
		<h2 class="mt-4 font-display text-2xl font-bold text-ink-800" data-testid="confirmation-heading">
			Order sent to the kitchen!
		</h2>
		<p class="mt-1 text-sm text-ink-400">The counter has received your order and will start preparing it shortly.</p>

		<div class="mt-5 w-full rounded-2xl bg-sand-100 p-4">
			<div class="text-xs font-semibold uppercase tracking-wide text-ink-400">Order number</div>
			<div class="font-display text-3xl font-extrabold text-lagoon-700" data-testid="order-number">{orderNumber}</div>
			<div class="mt-2 flex items-center justify-center gap-1.5 text-sm text-ink-600">
				<Icon name="user" size={14} /> {tableLabel}
			</div>
		</div>

		<p class="mt-4 text-xs text-ink-400">
			Please keep this screen handy. A member of staff may reference your order number.
		</p>

		<Button variant="primary" size="lg" full class="mt-5" onclick={() => { open = false; onclose(); }} data-testid="confirmation-done">
			Back to menu
		</Button>
	</div>
</Dialog>
