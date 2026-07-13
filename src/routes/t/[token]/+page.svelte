<script lang="ts">
	import {
		customerMoney,
		type ClientBaseCurrency,
		type ClientDisplayCurrency,
	} from '$lib/currency';
	import { customerMenuSearchText } from '$lib/customer-menu';
	import {
		addBundle,
		cartTotalMinor,
		configureVariant,
		createOrderCart,
		flattenOrder,
		flattenVariants,
		hasBeverage,
		lineCapMessage,
		lineCount,
		removeVariant,
		replaceBundle,
		setVariantQuantity,
		splitVariant,
		transitionOrderFlow,
		variantKey,
		type ConfigTarget,
		type FlowEvent,
		type FlowState,
		type OrderCart,
		type OrderVariant,
		type VariantInput,
	} from '$lib/customer/order-state';
	import CurrencySelector from '$lib/components/customer/currency-selector.svelte';
	import MenuItemImage from '$lib/components/customer/menu-item-image.svelte';
	import MenuItemMetadata from '$lib/components/customer/menu-item-metadata.svelte';
	import MenuTools from '$lib/components/customer/menu-tools.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PublicItem } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Draft = {
		parent: VariantInput;
		children: VariantInput[];
		mode: 'new' | 'edit' | 'beverage';
		edit?: { lineId: string; quantity: number };
	};

	let cart = $state<OrderCart>(createOrderCart());
	let flow = $state<FlowState>({ kind: 'browsing' });
	let message = $state('');
	let key: string = $state(String(data.idempotencyKey));
	let submitting = $state(false);
	let selected = $state('');
	let cartOpen = $state(false);
	let search = $state('');
	let orderNumber = $state<number | null>(null);
	let confirmation = $state<HTMLDialogElement>();
	let wizard = $state<HTMLDialogElement>();
	let beverageDialog = $state<HTMLDialogElement>();
	let draft = $state<Draft | null>(null);
	let draftItem = $state<PublicItem | null>(null);
	let configuringChild = $state<number | null>(null);
	let dialogReturnFocus = $state<HTMLElement | null>(null);

	const base = $derived({
		code: data.menu.currency,
		minorUnit: data.menu.currencyMinorUnit,
		locale: data.menu.currencyLocale,
	} as ClientBaseCurrency);
	const quotes = $derived((data.menu.displayCurrencies ?? []) as ClientDisplayCurrency[]);
	const quote = $derived(quotes.find((entry) => entry.code === selected));
	// Suggestion-only items are deliberately absent from category browsing but still
	// resolve here so they use the identical configurator, cart, and price display.
	const allItems = $derived(
		Array.from(
			new Map(
				[
					...data.menu.categories.flatMap((category) => category.items),
					...data.menu.categories.flatMap((category) =>
						category.items.flatMap((item) => item.suggestions ?? []),
					),
				].map((item) => [item.id, item]),
			).values(),
		),
	);
	const variants = $derived(flattenVariants(cart));
	const count = $derived(variants.reduce((sum, line) => sum + line.quantity, 0));
	const money = (minor: number) => customerMoney(minor, base, quote);
	const itemById = (id: string) => allItems.find((item) => item.id === id);
	const unitMinor = (entry: Pick<VariantInput, 'itemId' | 'choiceIds'>) => {
		const item = itemById(entry.itemId);
		const extras = (item?.comboGroups ?? [])
			.flatMap((group) => group.choices)
			.filter((choice) => entry.choiceIds?.includes(choice.id))
			.reduce((sum, choice) => sum + choice.priceDeltaMinor, 0);
		return (item?.promotion?.priceMinor ?? item?.priceMinor ?? 0) + extras;
	};
	const total = $derived(cartTotalMinor(cart, (line) => line.unitMinor ?? unitMinor(line)));
	const draftTotal = $derived(
		draft
			? [draft.parent, ...draft.children].reduce(
					(sum, line) => sum + unitMinor(line) * (line.quantity ?? 1),
					0,
				)
			: 0,
	);
	const beverageTargets = $derived(
		(data.menu.beveragePrompt?.itemIds ?? [])
			.map(itemById)
			.filter((item): item is PublicItem => !!item),
	);
	const eligibleBeverages = $derived(
		beverageTargets.filter((item) => !variants.some((line) => line.itemId === item.id)),
	);

	function move(event: FlowEvent) {
		const result = transitionOrderFlow(flow, event);
		if (result.accepted) flow = result.state;
		return result.accepted;
	}
	function initialLine(item: PublicItem, existing?: VariantInput): VariantInput {
		const choiceIds =
			existing?.choiceIds ??
			(item.comboGroups ?? []).flatMap((group) =>
				group.choices.filter((choice) => choice.isDefault).map((choice) => choice.id),
			);
		return {
			itemId: item.id,
			quantity: existing?.quantity ?? 1,
			choiceIds,
			note: existing?.note,
			...(existing?.suggestedFromItemId
				? { suggestedFromItemId: existing.suggestedFromItemId }
				: {}),
			unitMinor: unitMinor({ itemId: item.id, choiceIds }),
		};
	}
	function lineForDraft() {
		return !draft
			? null
			: configuringChild === null
				? draft.parent
				: (draft.children[configuringChild] ?? null);
	}
	function itemForDraft() {
		const line = lineForDraft();
		return line ? (itemById(line.itemId) ?? null) : null;
	}
	function hasGroups(item: PublicItem | null | undefined) {
		return (item?.comboGroups?.length ?? 0) > 0;
	}
	function validLine(item: PublicItem | null | undefined, entry: VariantInput | null) {
		return (
			!!item &&
			!!entry &&
			(item.comboGroups ?? []).every((group) => {
				const chosen =
					entry.choiceIds?.filter((id) => group.choices.some((choice) => choice.id === id))
						.length ?? 0;
				return chosen >= group.minChoices && chosen <= group.maxChoices;
			})
		);
	}
	function choiceLabels(entry: Pick<VariantInput, 'itemId' | 'choiceIds'>) {
		const item = itemById(entry.itemId);
		return (item?.comboGroups ?? []).flatMap((group) =>
			group.choices
				.filter((choice) => entry.choiceIds?.includes(choice.id))
				.map((choice) => choice.name),
		);
	}
	function rememberDialogTrigger() {
		if (!dialogReturnFocus && document.activeElement instanceof HTMLElement)
			dialogReturnFocus = document.activeElement;
	}
	function restoreDialogFocus() {
		requestAnimationFrame(() => {
			if (confirmation?.open || wizard?.open || beverageDialog?.open) return;
			dialogReturnFocus?.focus();
			dialogReturnFocus = null;
		});
	}
	function trapDialogFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const dialog = [confirmation, wizard, beverageDialog].find((candidate) => candidate?.open);
		if (!dialog) return;
		const focusable = [
			...dialog.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		];
		if (!focusable.length) return;
		const first = focusable[0],
			last = focusable.at(-1)!;
		if (
			(event.shiftKey &&
				(document.activeElement === first || !dialog.contains(document.activeElement))) ||
			(!event.shiftKey &&
				(document.activeElement === last || !dialog.contains(document.activeElement)))
		) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		}
	}
	$effect(() => {
		const dialogs = [confirmation, wizard, beverageDialog].filter(
			(dialog): dialog is HTMLDialogElement => !!dialog,
		);
		dialogs.forEach((dialog) => dialog.addEventListener('close', restoreDialogFocus));
		document.addEventListener('keydown', trapDialogFocus);
		return () => {
			dialogs.forEach((dialog) => dialog.removeEventListener('close', restoreDialogFocus));
			document.removeEventListener('keydown', trapDialogFocus);
		};
	});

	function startDraft(item: PublicItem, mode: Draft['mode'] = 'new', edit?: OrderVariant) {
		rememberDialogTrigger();
		draftItem = item;
		configuringChild = null;
		const children =
			edit?.role === 'parent'
				? variants
						.filter((line) => line.bundleId === edit.bundleId && line.role !== 'parent')
						.map((line) => initialLine(itemById(line.itemId)!, line))
				: [];
		draft = {
			parent: initialLine(
				item,
				edit ? { ...edit, quantity: edit.quantity > 1 ? 1 : edit.quantity } : undefined,
			),
			children,
			mode,
			...(edit ? { edit: { lineId: edit.lineId, quantity: edit.quantity } } : {}),
		};
		if (mode === 'beverage' && flow.kind === 'beverage-prompt')
			move({ type: 'ADD_BEVERAGE', hasModifiers: hasGroups(item) });
		else
			move({
				type: 'ADD',
				hasModifiers: hasGroups(item),
				hasSuggestions: mode !== 'beverage' && !!item.suggestions?.length,
			});
		wizard?.showModal();
	}
	function add(itemId: string) {
		const item = itemById(itemId);
		if (item?.availability === 'available') startDraft(item);
	}
	function editVariant(line: OrderVariant) {
		const item = itemById(line.itemId);
		if (item) startDraft(item, 'edit', line);
	}
	function closeDraft(event?: Event) {
		event?.preventDefault();
		if (flow.kind !== 'browsing' && flow.kind !== 'cancelled') move({ type: 'CANCEL' });
		if (flow.kind === 'cancelled') move({ type: 'CONFIRM' });
		draft = null;
		draftItem = null;
		configuringChild = null;
		if (wizard?.open) wizard.close();
	}
	function setActiveLine(next: VariantInput) {
		if (!draft) return;
		draft =
			configuringChild === null
				? { ...draft, parent: next }
				: {
						...draft,
						children: draft.children.map((entry, index) =>
							index === configuringChild ? next : entry,
						),
					};
	}
	function choose(id: string) {
		const item = itemForDraft(),
			entry = lineForDraft();
		if (!item || !entry) return;
		const group = item.comboGroups?.find((candidate) =>
			candidate.choices.some((choice) => choice.id === id),
		);
		if (!group) return;
		const selected = entry.choiceIds?.includes(id) ?? false;
		const inGroup =
			entry.choiceIds?.filter((choice) => group.choices.some((option) => option.id === choice)) ??
			[];
		const choiceIds = selected
			? entry.choiceIds!.filter((choice) => choice !== id)
			: group.maxChoices === 1
				? entry
						.choiceIds!.filter((choice) => !group.choices.some((option) => option.id === choice))
						.concat(id)
				: inGroup.length >= group.maxChoices
					? entry.choiceIds!
					: entry.choiceIds!.concat(id);
		setActiveLine({ ...entry, choiceIds, unitMinor: unitMinor({ ...entry, choiceIds }) });
	}
	function finishModifiers() {
		if (!validLine(itemForDraft(), lineForDraft()) || !draft) return;
		if (configuringChild !== null) {
			configuringChild = null;
			move({ type: 'SUGGEST', hasSuggestions: true, parentHasModifiers: hasGroups(draftItem) });
			return;
		}
		move({
			type: 'SUGGEST',
			hasSuggestions: draft.mode !== 'beverage' && !!draftItem?.suggestions?.length,
			parentHasModifiers: hasGroups(draftItem),
		});
	}
	function addSuggestion(item: PublicItem) {
		if (
			!draft ||
			draft.children.some((entry) => entry.itemId === item.id) ||
			item.availability !== 'available'
		)
			return;
		const next = initialLine(item, { itemId: item.id, suggestedFromItemId: draftItem?.id });
		draft = { ...draft, children: [...draft.children, next] };
		if (hasGroups(item)) {
			configuringChild = draft.children.length - 1;
			move({ type: 'CONFIGURE', target: 'suggestion', hasModifiers: true, returnTo: 'suggesting' });
		}
	}
	function removeChild(index: number) {
		if (draft)
			draft = {
				...draft,
				children: draft.children.filter((_, childIndex) => childIndex !== index),
			};
	}
	function updateDraftNote(index: number, note: string) {
		if (!draft) return;
		const list = [draft.parent, ...draft.children];
		const target = list[index];
		if (!target) return;
		const next = { ...target, note: note.trim() || undefined };
		draft =
			index === 0
				? { ...draft, parent: next }
				: {
						...draft,
						children: draft.children.map((entry, child) => (child === index - 1 ? next : entry)),
					};
	}
	function backDraft() {
		const wasChild = configuringChild;
		if (!move({ type: 'BACK' })) return;
		if (wasChild !== null && flow.kind === 'suggesting' && draft) {
			draft = { ...draft, children: draft.children.filter((_, index) => index !== wasChild) };
			configuringChild = null;
		} else if (flow.kind === 'configuring') configuringChild = null;
		else if (flow.kind === 'browsing') closeDraft();
	}
	function showReview() {
		if (draft)
			move({
				type: 'REVIEW',
				parentHasModifiers: hasGroups(draftItem),
				hasSuggestions: draft.children.length > 0 || !!draftItem?.suggestions?.length,
			});
	}
	function commitDraft() {
		if (
			!draft ||
			!validLine(draftItem, draft.parent) ||
			draft.children.some((entry) => !validLine(itemById(entry.itemId), entry))
		)
			return;
		let result;
		if (draft.edit) {
			const original = variants.find((line) => line.lineId === draft!.edit!.lineId);
			result =
				original?.role === 'parent' &&
				variants.some((line) => line.bundleId === original.bundleId && line.role !== 'parent')
					? replaceBundle(cart, original.bundleId, {
							parent: draft.parent,
							additions: draft.children.map((entry) => ({ ...entry, role: 'suggestion' as const })),
						})
					: draft.edit.quantity > 1 && original && variantKey(original) !== variantKey(draft.parent)
						? splitVariant(cart, draft.edit.lineId, draft.parent)
						: configureVariant(cart, draft.edit.lineId, draft.parent);
		} else
			result = addBundle(cart, {
				parent: draft.parent,
				additions: draft.children.map((entry) => ({ ...entry, role: 'suggestion' as const })),
			});
		if (!result.accepted) {
			message = lineCapMessage(cart);
			return;
		}
		cart = result.cart;
		move({ type: 'COMMIT' });
		const mode = draft.mode;
		draft = null;
		draftItem = null;
		configuringChild = null;
		wizard?.close();
		if (mode === 'beverage') submit();
	}
	function changeQuantity(line: OrderVariant, delta: number) {
		const result = setVariantQuantity(
			cart,
			line.lineId,
			Math.max(1, Math.min(20, line.quantity + delta)),
		);
		if (result.accepted) cart = result.cart;
	}
	function remove(line: OrderVariant) {
		cart = removeVariant(cart, line.lineId);
	}
	function visible(item: Parameters<typeof customerMenuSearchText>[0], category: { name: string }) {
		return (
			!search.trim() ||
			customerMenuSearchText(item, category.name).includes(search.trim().toLowerCase())
		);
	}
	function openBeveragePrompt() {
		rememberDialogTrigger();
		beverageDialog?.showModal();
	}
	async function sendOrder() {
		if (!lineCount(cart) || submitting) return;
		submitting = true;
		try {
			const response = await fetch(`/api/tables/${location.pathname.split('/').pop()}/orders`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ idempotencyKey: key, lines: flattenOrder(cart) }),
			});
			const body = (await response.json()) as {
				message?: string;
				nextIdempotencyKey?: string;
				order?: { displayNumber?: number };
			};
			if (!response.ok) {
				message = `${body.message ?? 'Unable to send order'} Your cart is still ready to submit.`;
				move({ type: 'SUBMISSION_FAILED' });
				return;
			}
			message = 'Order sent';
			orderNumber = body.order?.displayNumber ?? null;
			cart = createOrderCart();
			cartOpen = false;
			if (body.nextIdempotencyKey) key = body.nextIdempotencyKey;
			move({ type: 'CONFIRM' });
			confirmation?.showModal();
		} catch {
			message = 'Your order is still safe to retry.';
			move({ type: 'SUBMISSION_FAILED' });
		} finally {
			submitting = false;
		}
	}
	function submit() {
		if (!lineCount(cart) || submitting) return;
		if (flow.kind === 'retrying') {
			if (move({ type: 'RETRY' })) void sendOrder();
			return;
		}
		flow = { kind: 'reviewing', parentHasModifiers: false, hasSuggestions: false };
		const needsBeverage =
			!!data.menu.beveragePrompt &&
			!hasBeverage(cart, data.menu.beveragePrompt.itemIds) &&
			eligibleBeverages.length > 0;
		if (!move({ type: 'SUBMIT', needsBeverage })) return;
		if (needsBeverage) openBeveragePrompt();
		else void sendOrder();
	}
	function chooseBeverage(item: PublicItem) {
		if (flow.kind !== 'beverage-prompt') return;
		beverageDialog?.close();
		startDraft(item, 'beverage');
	}
	function skipBeverage() {
		if (move({ type: 'SKIP' })) {
			beverageDialog?.close();
			void sendOrder();
		}
	}
	function cancelBeverage(event?: Event) {
		event?.preventDefault();
		if (flow.kind === 'beverage-prompt') move({ type: 'BACK' });
		if (beverageDialog?.open) beverageDialog.close();
	}
	function closeConfirmation() {
		confirmation?.close();
	}
	function resetConfirmation() {
		if (flow.kind === 'confirmed') move({ type: 'CONFIRM' });
	}
</script>

<svelte:head><title>Table {data.table.label} — Menyue</title></svelte:head>
<main
	class="table-shell customer-brand"
	style:--customer-primary={data.menu.brand.primary}
	style:--customer-primary-foreground={data.menu.brand.primaryForeground}
	style:--customer-accent={data.menu.brand.accent}
	style:--customer-accent-foreground={data.menu.brand.accentForeground}
>
	<header class="table-nav">
		<a class="wordmark customer-wordmark" href="/"
			>{#if data.menu.brand.logoAssetId}<img
					src={`/media/${data.menu.brand.logoAssetId}`}
					alt={`${data.menu.hero.title} logo`}
				/>{/if}<span>{data.menu.hero.title}</span></a
		>
		<div class="table-nav-actions">
			<span class="table-label">{data.table.label}</span><div class="table-header-currency"><CurrencySelector
				{base}
				{quotes}
				bind:value={selected}
			/></div>
		</div>
	</header>
	<section class="table-intro compact">
		<p class="eyebrow">At your table · {data.table.label}</p>
		<h1>What are you having?</h1>
		<p>Search the menu or jump straight to a category.</p>
	</section>
	<div class="table-menu-layout">
		<MenuTools categories={data.menu.categories} searchLabel="Search dishes" bind:search
			>{#snippet controls()}<CurrencySelector
					{base}
					{quotes}
					bind:value={selected}
					testId="currency-selector-sticky"
				/>{/snippet}
			<section class="table-menu">
				{#each data.menu.categories as category}{@const items = category.items.filter((item) =>
						visible(item, category),
					)}{#if items.length}<section id={category.id} class="table-category">
							<div class="table-category-head">
								<h2>{category.name}</h2>
								<span>{items.length} dishes</span>
							</div>
							<div class="table-dishes">
								{#each items as item}<article class="table-dish" data-testid={`dish-${item.id}`}>
										<MenuItemImage {item} className="table-dish-image" />
										<div class="table-dish-top">
											<div>
												<h3>{item.name}</h3>
												{#if item.description}<p>{item.description}</p>{/if}<MenuItemMetadata
													{item}
												/>{#if item.availability === 'sold_out'}<span
														class="sold-out-badge"
														role="status">Sold out</span
													>{/if}
											</div>
											<strong>{money(item.promotion?.priceMinor ?? item.priceMinor)}</strong>
										</div>
										<Button
											size="sm"
											data-testid={`add-${item.id}`}
											disabled={item.availability === 'sold_out'}
											onclick={() => add(item.id)}
											>{item.availability === 'sold_out' ? 'Sold out' : 'Add'}</Button
										>
									</article>{/each}
							</div>
						</section>{/if}{/each}{#if !data.menu.categories.some( (category) => category.items.some( (item) => visible(item, category) ) )}<div
						class="empty-menu"
					>
						<h2>No dishes found</h2>
						<p>Try a dish, category, allergy or dietary term.</p>
						<button onclick={() => (search = '')}>Clear search</button>
					</div>{/if}
			</section></MenuTools
		>
	</div>
	<div class="cart-bar" class:visible={count > 0}>
		<button
			class="cart-review"
			data-testid="cart-open"
			aria-expanded={cartOpen}
			aria-controls="table-cart"
			onclick={() => (cartOpen = !cartOpen)}
			><span aria-live="polite" aria-atomic="true"
				>{count} {count === 1 ? 'dish' : 'dishes'} · {money(total)}</span
			><b>{cartOpen ? 'Close' : 'Review'} →</b></button
		><Button
			size="sm"
			data-testid="submit-order"
			disabled={!lineCount(cart) || submitting}
			onclick={submit}
			>{submitting ? 'Sending…' : flow.kind === 'retrying' ? 'Retry order' : 'Submit'}</Button
		>
	</div>
	{#if message}<p class:success={message === 'Order sent'} class="table-toast" role="status">
			{message}
		</p>{/if}
	<dialog
		bind:this={confirmation}
		class="order-confirmation"
		aria-labelledby="confirmation-title"
		aria-describedby="confirmation-description"
		onclose={resetConfirmation}
	>
		<p class="eyebrow">Order received</p>
		<h2 id="confirmation-title">Thank you.</h2>
		<p>
			{data.table.label}{#if orderNumber}
				· Order #{orderNumber}{/if}
		</p>
		<p id="confirmation-description" class="confirmation-copy">
			The kitchen has your order and will update the counter board next.
		</p>
		<Button autofocus onclick={closeConfirmation}>Continue browsing</Button>
	</dialog>
	<dialog
		bind:this={wizard}
		class="order-confirmation order-wizard"
		aria-labelledby="wizard-title"
		data-testid="order-draft"
		oncancel={closeDraft}
	>
		{#if draft && draftItem}{#if flow.kind === 'configuring'}{@const activeItem =
					itemForDraft()}{@const activeLine = lineForDraft()}{#if activeItem && activeLine}<p
						class="eyebrow"
					>
						{configuringChild === null ? 'Configure item' : 'Configure added item'}
					</p>
					<h2 id="wizard-title">{activeItem.name}</h2>
					<p>Make it yours.</p>
					{#each activeItem.comboGroups ?? [] as group}<fieldset
							data-testid={`modifier-${activeItem.id}`}
						>
							<legend>{group.name} · choose {group.minChoices}–{group.maxChoices}</legend
							>{#each group.choices as option}<label class="choice"
									><input
										type={group.maxChoices === 1 ? 'radio' : 'checkbox'}
										name={`group-${group.id}`}
										checked={activeLine.choiceIds?.includes(option.id)}
										disabled={!activeLine.choiceIds?.includes(option.id) &&
											group.maxChoices > 1 &&
											(activeLine.choiceIds?.filter((id) =>
												group.choices.some((choice) => choice.id === id),
											).length ?? 0) >= group.maxChoices}
										onchange={() => choose(option.id)}
										data-testid={`choice-${option.id}`}
									/>{option.name}<em
										>{option.priceDeltaMinor ? `+${money(option.priceDeltaMinor)}` : 'Included'}</em
									></label
								>{/each}
						</fieldset>{/each}
					<div class="dialog-actions">
						<Button variant="outline" data-testid="draft-cancel" onclick={closeDraft}>Cancel</Button
						><Button
							data-testid="draft-next"
							disabled={!validLine(activeItem, activeLine)}
							onclick={finishModifiers}>Continue</Button
						>
					</div>{/if}{:else if flow.kind === 'suggesting'}<p class="eyebrow">Optional additions</p>
				<h2 id="wizard-title">Goes well with…</h2>
				<p>Add another item when you want it; nothing is automatic.</p>
				{#each draftItem.suggestions ?? [] as suggestion}<div class="choice">
						<span>{suggestion.name}</span><em>{money(suggestion.priceMinor)}</em><Button
							size="sm"
							data-testid={`suggestion-add-${suggestion.id}`}
							disabled={draft.children.some((entry) => entry.itemId === suggestion.id) ||
								suggestion.availability === 'sold_out'}
							onclick={() => addSuggestion(suggestion)}
							>{draft.children.some((entry) => entry.itemId === suggestion.id)
								? 'Added'
								: 'Add'}</Button
						>
					</div>{/each}{#if draft.children.length}<div class="mt-3">
						{#each draft.children as child, index}<div
								class="choice"
								data-testid={`draft-child-${child.itemId}`}
							>
								<span
									>{itemById(child.itemId)?.name} · {child.quantity} × {money(
										unitMinor(child),
									)}</span
								><Button size="sm" variant="ghost" onclick={() => removeChild(index)}>Remove</Button
								>
							</div>{/each}
					</div>{/if}
				<div class="dialog-actions">
					<Button variant="outline" onclick={backDraft}>Back</Button><Button
						data-testid="draft-review"
						onclick={showReview}>Continue</Button
					>
				</div>{:else if flow.kind === 'reviewing'}<p class="eyebrow">Review order group</p>
				<h2 id="wizard-title">Ready to add?</h2>
				<p>Nothing reaches the cart until you confirm this group.</p>
				<div data-testid="draft-review-lines">
					{#each [draft.parent, ...draft.children] as entry, index}<section class="choice">
							<span
								><b>{index === 0 ? 'Main' : 'Added'} · {itemById(entry.itemId)?.name}</b><small
									class="block"
									>{choiceLabels(entry).join(', ') || 'No choices'}{#if entry.note}
										· Note: {entry.note}{/if}</small
								></span
							><em>{entry.quantity} × {money(unitMinor(entry))}</em><label
								class="sr-only"
								for={`draft-note-${index}`}>Note for {itemById(entry.itemId)?.name}</label
							><textarea
								id={`draft-note-${index}`}
								value={entry.note ?? ''}
								oninput={(event) => updateDraftNote(index, event.currentTarget.value)}
								placeholder="Kitchen note (optional)"></textarea>
						</section>{/each}
				</div>
				<p class="mt-3 font-semibold" data-testid="draft-total">Group total {money(draftTotal)}</p>
				<div class="dialog-actions">
					<Button variant="outline" onclick={backDraft}>Back</Button><Button
						data-testid="draft-commit"
						onclick={commitDraft}>{draft.mode === 'edit' ? 'Save changes' : 'Add to order'}</Button
					>
				</div>{/if}{/if}
	</dialog>
	{#if data.menu.beveragePrompt}<dialog
			bind:this={beverageDialog}
			class="order-confirmation beverage-dialog"
			aria-labelledby="beverage-title"
			data-testid="beverage-prompt"
			oncancel={cancelBeverage}
		>
			<p class="eyebrow">One last thing</p>
			<h2 id="beverage-title">{data.menu.beveragePrompt.heading}</h2>
			<p>{data.menu.beveragePrompt.body}</p>
			{#if eligibleBeverages.length}<div class="dialog-actions beverage-options">
					{#each eligibleBeverages as drink}<Button
							variant="outline"
							data-testid={`beverage-add-${drink.id}`}
							onclick={() => chooseBeverage(drink)}>{drink.name}</Button
						>{/each}
				</div>{/if}
			<div class="dialog-actions">
				<Button variant="outline" onclick={cancelBeverage}>Back</Button><Button
					data-testid="beverage-skip"
					onclick={skipBeverage}>{data.menu.beveragePrompt.skipLabel}</Button
				>
			</div>
		</dialog>{/if}
	{#if cartOpen}<aside id="table-cart" class="cart-sheet" aria-labelledby="table-cart-title">
			<p class="eyebrow">Your table order</p>
			<h2 id="table-cart-title">Ready for the kitchen?</h2>
			<div class="cart-lines">
				{#each variants as line}<section
						class="cart-line"
						data-testid={line.role === 'parent'
							? `cart-line-${line.lineId}`
							: `cart-child-${line.itemId}`}
					>
						<div>
							<b>{itemById(line.itemId)?.name}</b><small
								>{choiceLabels(line).join(', ') || 'Standard'}{#if line.note}
									· Note: {line.note}{/if}</small
							>{#if line.quantity > 1}<small class="variant-note"
									>Edit customizes one of {line.quantity}.</small
								>{/if}
						</div>
						<div class="cart-line-controls">
							<Button
								size="sm"
								variant="outline"
								aria-label={`Decrease ${itemById(line.itemId)?.name}`}
								onclick={() => changeQuantity(line, -1)}>−</Button
							><b aria-live="polite" aria-label={`Quantity ${line.quantity}`}>{line.quantity}</b
							><Button
								size="sm"
								variant="outline"
								aria-label={`Increase ${itemById(line.itemId)?.name}`}
								onclick={() => changeQuantity(line, 1)}>+</Button
							><Button
								size="sm"
								variant="outline"
								data-testid={`edit-${line.itemId}`}
								onclick={() => editVariant(line)}>Edit</Button
							><button
								class="cart-remove"
								aria-label={`Remove ${itemById(line.itemId)?.name}`}
								onclick={() => remove(line)}>Remove</button
							>
						</div>
					</section>{/each}
			</div>
			<p class="mt-3 font-semibold">Estimated total {money(total)}</p>
			{#if quote}<p class="text-xs text-muted-foreground">
					Estimate in {quote.code} · {quote.source === 'fixed'
						? 'restaurant fixed rate'
						: `${quote.freshness} cached provider rate`}
				</p>{/if}<Button class="w-full" disabled={!lineCount(cart) || submitting} onclick={submit}
				>{submitting
					? 'Sending…'
					: flow.kind === 'retrying'
						? 'Retry order'
						: 'Submit order'}</Button
			>
		</aside>{/if}
</main>

<style>
	.table-shell {
		overflow: visible;
	}
	.table-menu-layout {
		max-width: 1170px;
		margin: 0 auto;
		padding: 0 clamp(1rem, 5vw, 6rem);
	}
	.table-menu {
		max-width: none;
		margin: 0;
		padding: 0;
	}
	.table-category {
		scroll-margin-top: 1.25rem;
	}
	.table-shell :is(a, button, input, textarea):focus-visible {
		outline: 3px solid var(--customer-focus);
		outline-offset: 3px;
	}
	.dialog-actions,
	.cart-line-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.order-wizard {
		text-align: left;
	}
	.order-wizard textarea {
		width: 100%;
		min-height: 44px;
		margin-top: 0.45rem;
	}
	.cart-line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.7rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--customer-border);
	}
	.cart-line > div:first-child {
		min-width: 0;
		display: grid;
		gap: 0.18rem;
		overflow-wrap: anywhere;
	}
	.cart-line small {
		color: var(--customer-muted);
		font-size: 0.73rem;
	}
	.variant-note {
		color: var(--customer-danger) !important;
	}
	.cart-remove {
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--customer-danger);
		cursor: pointer;
	}
	.sold-out-badge {
		display: inline-flex;
		width: fit-content;
		margin-top: 0.35rem;
		border-radius: 999px;
		padding: 0.18rem 0.5rem;
		background: var(--customer-danger);
		color: var(--customer-primary-foreground);
		font-size: 0.72rem;
		font-weight: 700;
	}
	@media (max-width: 760px) {
		.table-header-currency {
			display: none;
		}
		.table-category {
			grid-template-columns: minmax(0, 1fr) !important;
			scroll-margin-top: 10rem;
		}
		.table-dishes {
			grid-template-columns: minmax(0, 1fr) !important;
		}
		.table-dish,
		.table-dish-top > div {
			min-width: 0;
		}
		.cart-bar {
			right: max(1rem, env(safe-area-inset-right));
			bottom: max(1rem, env(safe-area-inset-bottom));
			left: max(1rem, env(safe-area-inset-left));
			width: auto;
		}
		.cart-sheet {
			right: max(1rem, env(safe-area-inset-right));
			bottom: calc(5.5rem + env(safe-area-inset-bottom));
			left: max(1rem, env(safe-area-inset-left));
			width: auto;
			max-height: min(70dvh, 38rem);
			overflow-y: auto;
		}
		.order-confirmation {
			max-height: min(88dvh, 44rem);
			overflow-y: auto;
			padding-bottom: max(1.4rem, env(safe-area-inset-bottom));
		}
		.cart-line {
			grid-template-columns: 1fr;
		}
		.cart-line-controls {
			justify-content: flex-start;
		}
	}
</style>
