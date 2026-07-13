<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: "default" | "sm" } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn("bg-card text-card-foreground gap-6 rounded-xl border py-6 text-sm shadow-sm has-[>img:first-child]:pt-0 group/card flex flex-col data-[size=sm]:gap-4 data-[size=sm]:py-4", className)}
	{...restProps}
>
	{@render children?.()}
</div>
