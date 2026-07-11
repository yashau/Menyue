<script lang="ts">
	interface Props {
		name: string;
		size?: number;
		class?: string;
	}
	let { name, size = 20, class: klass = '' }: Props = $props();

	// 24x24 stroke icons (feather-style)
	const paths: Record<string, string> = {
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
		x: 'M6 6l12 12M18 6L6 18',
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		cart: 'M3 4h2l2.4 12.5a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
		chevronDown: 'M6 9l6 6 6-6',
		chevronRight: 'M9 6l6 6-6 6',
		chevronLeft: 'M15 6l-6 6 6 6',
		check: 'M5 13l4 4L19 7',
		leaf: 'M11 20A7 7 0 0 1 4 13c0-6 5-9 15-9 0 8-3 13-8 13zM4 20c2-6 6-8 10-9',
		alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
		info: 'M12 16v-4M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
		trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
		edit: 'M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
		coins: 'M8 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM16 21a6 6 0 1 0 0-12',
		clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
		menu: 'M4 6h16M4 12h16M4 18h16',
		arrowRight: 'M5 12h14M13 6l6 6-6 6',
		sparkle: 'M12 3l1.8 4.9L19 9.7l-4.2 3 1.4 5.3L12 15.8 7.8 18l1.4-5.3L5 9.7l5.2-1.8z',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'
	};
	const d = $derived(paths[name] ?? '');
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={klass}
	aria-hidden="true"
>
	<path d={d} />
</svg>
