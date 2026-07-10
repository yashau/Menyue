<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';
	type Choice = { group_name: string; choice_name: string; price_delta_minor: number };
	type Line = { quantity: number; item_name: string; total_minor: number; choices: Choice[] };
	type Order = {
		id: string;
		display_number: number;
		label: string;
		status: string;
		note?: string;
		total_minor: number;
		currency?: string;
		version: number;
		lines: Line[];
	};
	let { data }: { data: PageData } = $props();
	let orders = $state<Order[]>([]),
		connected = $state(false),
		message = $state('');
	$effect(() => {
		orders = data.orders as unknown as Order[];
	});
	const seen = new Set<string>();
	const csrf = () =>
		document.cookie
			.split('; ')
			.find((part) => part.startsWith('menyue_csrf='))
			?.split('=')[1] ?? '';
	const money = (minor: number, currency = 'MVR') =>
		new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);
	async function enableNotifications() {
		if (typeof Notification === 'undefined') {
			message = 'Notifications are not supported in this browser.';
			return;
		}
		const result = await Notification.requestPermission();
		message =
			result === 'granted'
				? 'Browser notifications enabled.'
				: 'Notification permission was not granted.';
	}
	async function refresh(notify = false) {
		const response = await fetch('/api/counter/orders');
		if (!response.ok) return;
		const next = ((await response.json()) as { orders: Order[] }).orders;
		if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted')
			for (const order of next) {
				const key = `${order.id}:${order.version}`;
				if (!seen.has(key)) {
					seen.add(key);
					new Notification('Menyue order update', { body: `Order #${order.display_number}` });
				}
			}
		orders = next;
	}
	async function status(order: Order, value: string) {
		const response = await fetch(`/api/counter/orders/${order.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
			body: JSON.stringify({ status: value, version: order.version }),
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => ({ message: 'Unable to update order' }))) as {
				message?: string;
			};
			message = body.message ?? 'Unable to update order';
		}
		await refresh();
	}
	onMount(() => {
		void refresh();
		const timer = setInterval(() => void refresh(true), 12000);
		let socket: WebSocket | undefined;
		let stopped = false;
		let retry = 1000;
		const connect = () => {
			socket = new WebSocket(
				`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/counter/stream`,
			);
			socket.onopen = () => {
				connected = true;
				retry = 1000;
			};
			socket.onmessage = () => void refresh(true);
			socket.onclose = () => {
				connected = false;
				if (!stopped) {
					setTimeout(connect, retry);
					retry = Math.min(retry * 2, 15000);
				}
			};
		};
		connect();
		return () => {
			stopped = true;
			clearInterval(timer);
			socket?.close();
		};
	});
</script>

<main class="p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl">Live orders {connected ? '●' : '○'}</h1>
		<Button variant="outline" onclick={enableNotifications}>Enable notifications</Button>
	</div>
	{#if message}<p class="mt-2 text-sm">{message}</p>{/if}
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each orders as order}<article class="mt-4 rotate-[-0.4deg] rounded bg-amber-100 p-4 shadow">
				<strong>#{order.display_number} · {order.label}</strong>
				<p class="text-sm uppercase">{order.status}</p>
				{#if order.note}<p>{order.note}</p>{/if}{#each order.lines as line}<div
						class="my-2 border-t border-amber-300 pt-2"
					>
						{line.quantity}× {line.item_name} — {money(
							line.total_minor,
							order.currency,
						)}{#each line.choices as choice}<small class="block"
								>{choice.group_name}: {choice.choice_name}</small
							>{/each}
					</div>{/each}<b>Total {money(order.total_minor, order.currency)}</b>
				<div class="mt-3 flex flex-wrap gap-2">
					{#if order.status === 'new'}<Button size="sm" onclick={() => status(order, 'accepted')}
							>Accept</Button
						>{/if}{#if order.status === 'accepted'}<Button
							size="sm"
							onclick={() => status(order, 'preparing')}>Prepare</Button
						>{/if}{#if order.status === 'preparing'}<Button
							size="sm"
							onclick={() => status(order, 'ready')}>Ready</Button
						>{/if}{#if order.status === 'ready'}<Button
							size="sm"
							onclick={() => status(order, 'completed')}>Complete</Button
						>{/if}{#if !['completed', 'cancelled'].includes(order.status)}<Button
							size="sm"
							variant="destructive"
							onclick={() => status(order, 'cancelled')}>Cancel</Button
						>{/if}
				</div>
			</article>{/each}
	</div>
</main>
