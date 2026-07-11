<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';

	interface Props {
		open: boolean;
		onclose: () => void;
		onapply: (blob: Blob) => Promise<void> | void;
		aspect?: number; // width / height
		title?: string;
	}
	let { open = $bindable(), onclose, onapply, aspect = 4 / 3, title = 'Add photo' }: Props = $props();

	// Crop frame sized to the aspect ratio, fitting within the mobile dialog.
	const FW = 280;
	const FH = $derived(Math.round(FW / aspect));
	const OUT_W = 960;
	const OUT_H = $derived(Math.round(OUT_W / aspect));

	let fileUrl = $state<string | null>(null);
	let img: HTMLImageElement | null = null;
	let nW = 0;
	let nH = 0;
	let scale = $state(1);
	let scaleMin = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let busy = $state(false);
	let errorMsg = $state('');

	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	function clamp() {
		const w = nW * scale;
		const h = nH * scale;
		tx = Math.min(0, Math.max(FW - w, tx));
		ty = Math.min(0, Math.max(FH - h, ty));
	}

	function initFit() {
		scaleMin = Math.max(FW / nW, FH / nH);
		scale = scaleMin;
		tx = (FW - nW * scale) / 2;
		ty = (FH - nH * scale) / 2;
		clamp();
	}

	function pickFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		if (!/^image\/(png|jpe?g|webp|gif|avif|heic)$/i.test(f.type)) {
			errorMsg = 'Please choose an image file.';
			return;
		}
		errorMsg = '';
		if (fileUrl) URL.revokeObjectURL(fileUrl);
		fileUrl = URL.createObjectURL(f);
		const im = new Image();
		im.onload = () => {
			img = im;
			nW = im.naturalWidth;
			nH = im.naturalHeight;
			initFit();
		};
		im.onerror = () => (errorMsg = 'That image could not be loaded.');
		im.src = fileUrl;
	}

	function onZoom(next: number) {
		const cx = FW / 2;
		const cy = FH / 2;
		const sx = (cx - tx) / scale;
		const sy = (cy - ty) / scale;
		scale = next;
		tx = cx - sx * scale;
		ty = cy - sy * scale;
		clamp();
	}

	function down(e: PointerEvent) {
		if (!img) return;
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		tx += e.clientX - lastX;
		ty += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		clamp();
	}
	function up(e: PointerEvent) {
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	function reset() {
		if (fileUrl) URL.revokeObjectURL(fileUrl);
		fileUrl = null;
		img = null;
		errorMsg = '';
	}

	function close() {
		open = false;
		onclose();
	}

	async function apply() {
		if (!img || busy) return;
		busy = true;
		errorMsg = '';
		try {
			const canvas = document.createElement('canvas');
			canvas.width = OUT_W;
			canvas.height = OUT_H;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas unsupported');
			const sx = -tx / scale;
			const sy = -ty / scale;
			const sw = FW / scale;
			const sh = FH / scale;
			ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
			const blob: Blob | null = await new Promise((resolve) =>
				canvas.toBlob((b) => resolve(b), 'image/webp', 0.82)
			);
			const finalBlob =
				blob ??
				(await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)));
			if (!finalBlob) throw new Error('Could not process image');
			await onapply(finalBlob);
			busy = false;
			close();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Upload failed';
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset(); }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col items-center gap-4">
			{#if !fileUrl}
				<label
					class="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-10 text-center transition-colors hover:border-ring hover:bg-muted"
				>
					<span class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<ImagePlus class="size-6" />
					</span>
					<span class="font-medium">Choose a photo</span>
					<span class="text-xs text-muted-foreground">JPEG, PNG or WebP · you can crop &amp; zoom next</span>
					<input type="file" accept="image/*" class="sr-only" onchange={pickFile} />
				</label>
			{:else}
				<div
					class="relative touch-none overflow-hidden rounded-xl bg-muted ring-1 ring-inset ring-border"
					style="width:{FW}px;height:{FH}px"
					onpointerdown={down}
					onpointermove={move}
					onpointerup={up}
					onpointercancel={up}
					role="presentation"
				>
					<img
						src={fileUrl}
						alt="Crop preview"
						draggable="false"
						class="pointer-events-none absolute left-0 top-0 max-w-none select-none"
						style="transform: translate({tx}px, {ty}px) scale({scale}); transform-origin: top left; width:{nW}px; height:{nH}px"
					/>
				</div>

				<div class="flex w-full max-w-[280px] items-center gap-3">
					<ZoomIn class="size-4 shrink-0 text-muted-foreground" />
					<Slider
						type="single"
						min={scaleMin}
						max={scaleMin * 4}
						step={scaleMin / 100}
						value={scale}
						onValueChange={(v) => onZoom(v)}
						aria-label="Zoom"
					/>
				</div>
				<p class="text-xs text-muted-foreground">Drag to reposition · slide to zoom</p>
			{/if}

			{#if errorMsg}
				<p class="text-sm font-medium text-destructive" role="alert">{errorMsg}</p>
			{/if}
		</div>

		<Dialog.Footer class="flex-row items-center justify-between sm:justify-between">
			{#if fileUrl}
				<Button variant="outline" onclick={reset}>Choose different</Button>
				<Button onclick={apply} disabled={busy}>{busy ? 'Uploading…' : 'Use photo'}</Button>
			{:else}
				<span></span>
				<Button variant="ghost" onclick={close}>Cancel</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
