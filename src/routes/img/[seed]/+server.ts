import type { RequestHandler } from './$types';

/*
 * Self-contained procedural "food photography" — no external assets, works
 * offline / on plain-HTTP LAN, and never renders a broken image. A restaurant
 * can override any item with a real photo (items.image_url); this is the
 * tasteful fallback used otherwise.
 */

function hash(str: string): number {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Kind =
	| 'glass' | 'cup' | 'burger' | 'pizza' | 'bowl' | 'salad'
	| 'dessert' | 'bread' | 'plate';

function detectKind(seed: string): Kind {
	const s = seed;
	const has = (...k: string[]) => k.some((w) => s.includes(w));
	if (has('coffee', 'latte', 'cappuccino', 'espresso', 'flat-white', 'chai', 'tea', 'affogato', 'mocha')) return 'cup';
	if (has('juice', 'smoothie', 'water', 'soda', 'cola', 'lemonade', 'iced', 'milkshake', 'lassi', 'cooler', 'crush', 'detox', 'boost', 'ginger-beer', 'sparkling', 'coconut-water', 'blast')) return 'glass';
	if (has('burger')) return 'burger';
	if (has('pizza', 'margherita', 'diavola', 'formaggi')) return 'pizza';
	if (has('naan', 'roshi', 'bread', 'roti')) return 'bread';
	if (has('salad', 'nicoise', 'caesar', 'papaya', 'quinoa', 'halloumi')) return 'salad';
	if (has('cake', 'dessert', 'brulee', 'panna', 'sticky', 'bibikhaandu', 'molten', 'fruit', 'tart', 'gelato')) return 'dessert';
	if (has('soup', 'curry', 'riha', 'garudhiya', 'dhal', 'dal', 'pasta', 'noodle', 'rice', 'biryani', 'korma', 'masala', 'rendang', 'nasi', 'pad-thai', 'linguine', 'carbonara', 'gnocchi', 'lasagne', 'khichuni', 'chana', 'rendang', 'tom-yum', 'singapore', 'ramen', 'penne', 'spaghetti')) return 'bowl';
	return 'plate';
}

const H = (h: number, s: number, l: number, a = 1) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}% / ${a})`;

export const GET: RequestHandler = ({ params, url }) => {
	const seed = params.seed;
	const h = hash(seed);
	const rnd = mulberry32(h);
	const kindParam = url.searchParams.get('kind');
	let kind = detectKind(seed);
	if (kindParam === 'drink' && kind !== 'cup' && kind !== 'glass') kind = 'glass';

	// deterministic warm hue jitter
	const jitter = (base: number, spread: number) => base + (rnd() - 0.5) * spread;

	// studio backdrop — warm, soft, lets food pop
	const bgHue = jitter(34, 12);
	const bgTop = H(bgHue, 24, 92);
	const bgBot = H(bgHue + 6, 20, 80);

	let art = '';

	if (kind === 'glass') {
		const fruit = [
			[[345, 70, 62], [350, 68, 50]], // berry/watermelon
			[28, 85, 58], // orange
			[[95, 55, 48], [110, 50, 40]], // green
			[[45, 90, 60], [40, 88, 52]], // lemon/passion
			[[25, 45, 32], [24, 40, 24]] // cola/coffee
		];
		const pick = Math.floor(rnd() * 5);
		const isTwo = Array.isArray(fruit[pick][0]);
		const c1 = isTwo ? (fruit[pick] as number[][])[0] : (fruit[pick] as number[]);
		const c2 = isTwo ? (fruit[pick] as number[][])[1] : (fruit[pick] as number[]);
		const liquidTop = H(c1[0], c1[1], c1[2]);
		const liquidBot = H(c2[0], c2[1], c2[2] - 6);
		const bubbles = Array.from({ length: 8 }, () => {
			const cx = 168 + rnd() * 64;
			const cy = 150 + rnd() * 80;
			return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(2 + rnd() * 3).toFixed(1)}" fill="#ffffff" opacity="0.35"/>`;
		}).join('');
		art = `
		<g filter="url(#soft)">
			<path d="M162 96 h76 l-8 128 a12 12 0 0 1-12 11 h-36 a12 12 0 0 1-12-11 z" fill="#ffffff" opacity="0.28"/>
			<path d="M168 118 h64 l-7 104 a10 10 0 0 1-10 9 h-30 a10 10 0 0 1-10-9 z" fill="url(#liquid)"/>
			<rect x="196" y="70" width="9" height="60" rx="4" transform="rotate(9 200 100)" fill="${H(bgHue, 30, 96, 0.85)}"/>
			${bubbles}
			<ellipse cx="188" cy="128" rx="10" ry="24" fill="#ffffff" opacity="0.22"/>
		</g>`;
		return svg(seed, bgTop, bgBot, art, {
			liquid: [liquidTop, liquidBot],
			hot: false
		});
	}

	if (kind === 'cup') {
		const coffee = H(26, 55, 26);
		const crema = H(30, 60, 46);
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="238" rx="96" ry="20" fill="#00000012"/>
			<path d="M150 150 h100 v22 a50 40 0 0 1-100 0 z" fill="#ffffff"/>
			<path d="M150 150 h100 v10 a50 18 0 0 1-100 0 z" fill="${H(bgHue,15,88)}"/>
			<ellipse cx="200" cy="150" rx="50" ry="18" fill="${coffee}"/>
			<ellipse cx="200" cy="149" rx="42" ry="13" fill="${crema}"/>
			<ellipse cx="192" cy="146" rx="16" ry="5" fill="#ffffff" opacity="0.4"/>
			<path d="M250 158 q26 6 24 26 q-2 18 -22 20" fill="none" stroke="#ffffff" stroke-width="9" opacity="0.9"/>
		</g>
		<g stroke="${H(bgHue,10,100,0.5)}" stroke-width="4" fill="none" stroke-linecap="round">
			<path d="M186 138 q-8 -14 0 -28 q6 -12 0 -24"/>
			<path d="M214 138 q8 -14 0 -28 q-6 -12 0 -24"/>
		</g>`;
		return svg(seed, bgTop, bgBot, art, { hot: true });
	}

	if (kind === 'burger') {
		const bun = H(32, 62, 60), bunD = H(30, 55, 50), patty = H(22, 45, 26), cheese = H(45, 90, 60), let1 = H(96, 45, 50);
		const sesame = Array.from({ length: 6 }, () => `<ellipse cx="${(168 + rnd() * 64).toFixed(0)}" cy="${(120 + rnd() * 14).toFixed(0)}" rx="3" ry="2" fill="${H(45,60,90)}"/>`).join('');
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="232" rx="98" ry="18" fill="#00000012"/>
			<path d="M132 132 q68 -60 136 0 z" fill="${bun}"/>
			<path d="M132 132 q68 -50 136 0" fill="${bunD}" opacity="0.4"/>
			${sesame}
			<path d="M128 150 q72 30 144 0 l0 -8 q-72 -18 -144 0 z" fill="${let1}"/>
			<rect x="126" y="156" width="148" height="20" rx="9" fill="${cheese}"/>
			<path d="M130 172 h140 l-8 12 q-62 20 -124 0 z" fill="${patty}"/>
			<path d="M132 186 q68 26 136 0 l0 14 q-68 20 -136 0 z" fill="${bunD}"/>
		</g>`;
		return svg(seed, bgTop, bgBot, art, {});
	}

	if (kind === 'pizza') {
		const crust = H(34, 60, 62), sauce = H(10, 70, 45), cheese = H(44, 80, 68);
		const toppings = Array.from({ length: 9 }, () => {
			const ang = rnd() * Math.PI * 2, r = rnd() * 70;
			const cx = 200 + Math.cos(ang) * r, cy = 158 + Math.sin(ang) * r;
			const t = rnd();
			const col = t < 0.5 ? H(6, 65, 40) : t < 0.8 ? H(100, 45, 38) : H(40, 20, 96);
			return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(5 + rnd() * 5).toFixed(0)}" fill="${col}"/>`;
		}).join('');
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="164" rx="96" ry="90" fill="${crust}"/>
			<ellipse cx="200" cy="160" rx="82" ry="76" fill="${sauce}"/>
			<ellipse cx="200" cy="160" rx="78" ry="72" fill="${cheese}" opacity="0.92"/>
			${toppings}
		</g>`;
		return svg(seed, bgTop, bgBot, art, {});
	}

	if (kind === 'bowl' || kind === 'salad') {
		const isSalad = kind === 'salad';
		const contentTop = isSalad ? H(jitter(100, 30), 50, 52) : H(jitter(28, 16), 70, 50);
		const contentBot = isSalad ? H(jitter(120, 20), 45, 40) : H(jitter(24, 12), 65, 38);
		const garnish = Array.from({ length: 7 }, () => {
			const ang = rnd() * Math.PI * 2, r = rnd() * 66;
			const cx = 200 + Math.cos(ang) * r, cy = 168 + Math.sin(ang) * r * 0.7;
			const col = isSalad ? H(jitter(90, 60), 55, 55) : H(jitter(50, 60), 60, 55);
			return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(4 + rnd() * 5).toFixed(0)}" fill="${col}" opacity="0.85"/>`;
		}).join('');
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="196" rx="112" ry="30" fill="#00000010"/>
			<path d="M96 168 a104 104 0 0 0 208 0 z" fill="#ffffff"/>
			<ellipse cx="200" cy="168" rx="104" ry="30" fill="${H(bgHue,15,90)}"/>
			<ellipse cx="200" cy="166" rx="90" ry="24" fill="url(#liquid)"/>
			${garnish}
			<ellipse cx="176" cy="158" rx="18" ry="6" fill="#ffffff" opacity="0.25"/>
		</g>`;
		return svg(seed, bgTop, bgBot, art, { liquid: [contentTop, contentBot], hot: !isSalad });
	}

	if (kind === 'dessert') {
		const cake = H(jitter(28, 20), 55, 55), cream = H(40, 30, 94), berry = H(345, 65, 52), drizzle = H(20, 60, 28);
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="224" rx="92" ry="18" fill="#00000012"/>
			<path d="M150 210 l16 -78 h68 l16 78 z" fill="${cake}"/>
			<path d="M158 172 h84" stroke="${cream}" stroke-width="9"/>
			<path d="M166 148 h68" stroke="${cream}" stroke-width="7" opacity="0.8"/>
			<path d="M166 132 q34 -22 68 0" fill="${cream}"/>
			<circle cx="200" cy="120" r="9" fill="${berry}"/>
			<path d="M150 210 q50 16 100 0" fill="none" stroke="${drizzle}" stroke-width="4" opacity="0.5"/>
		</g>`;
		return svg(seed, bgTop, bgBot, art, {});
	}

	if (kind === 'bread') {
		const dough = H(38, 55, 72), char = H(28, 45, 40);
		const spots = Array.from({ length: 6 }, () => `<ellipse cx="${(150 + rnd() * 100).toFixed(0)}" cy="${(150 + rnd() * 40).toFixed(0)}" rx="${(6 + rnd() * 6).toFixed(0)}" ry="${(4 + rnd() * 4).toFixed(0)}" fill="${char}" opacity="0.3"/>`).join('');
		art = `
		<g filter="url(#soft)">
			<ellipse cx="200" cy="200" rx="104" ry="20" fill="#00000010"/>
			<ellipse cx="200" cy="166" rx="104" ry="52" fill="${dough}"/>
			<ellipse cx="200" cy="160" rx="96" ry="44" fill="${H(40,60,80)}"/>
			${spots}
		</g>`;
		return svg(seed, bgTop, bgBot, art, {});
	}

	// default: plated main
	const plate = H(bgHue, 12, 97);
	const protein = H(jitter(24, 14), 50, 40);
	const veg = H(jitter(95, 40), 50, 48);
	const blobs = Array.from({ length: 5 }, (_, i) => {
		const ang = (i / 5) * Math.PI * 2 + rnd();
		const r = 26 + rnd() * 20;
		const cx = 200 + Math.cos(ang) * r, cy = 160 + Math.sin(ang) * r * 0.8;
		const col = i % 2 ? veg : protein;
		return `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(20 + rnd() * 10).toFixed(0)}" ry="${(14 + rnd() * 8).toFixed(0)}" fill="${col}" opacity="0.92"/>`;
	}).join('');
	const herbs = Array.from({ length: 5 }, () => `<circle cx="${(160 + rnd() * 80).toFixed(0)}" cy="${(140 + rnd() * 40).toFixed(0)}" r="${(2 + rnd() * 2).toFixed(0)}" fill="${H(120,50,40)}"/>`).join('');
	art = `
	<g filter="url(#soft)">
		<ellipse cx="200" cy="176" rx="120" ry="30" fill="#00000010"/>
		<ellipse cx="200" cy="160" rx="118" ry="86" fill="${plate}"/>
		<ellipse cx="200" cy="160" rx="92" ry="64" fill="${H(bgHue,18,90)}"/>
		${blobs}${herbs}
	</g>`;
	return svg(seed, bgTop, bgBot, art, {});
};

function svg(
	label: string,
	bgTop: string,
	bgBot: string,
	art: string,
	opts: { liquid?: [string, string]; hot?: boolean }
): Response {
	const steam = opts.hot
		? `<g stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.28">
			<path d="M180 92 q-8 -16 0 -30 q6 -12 0 -26"/>
			<path d="M220 92 q8 -16 0 -30 q-6 -12 0 -26"/>
		</g>`
		: '';
	const liquidDefs = opts.liquid
		? `<linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${opts.liquid[0]}"/><stop offset="1" stop-color="${opts.liquid[1]}"/></linearGradient>`
		: '';
	const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${label}">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
			<stop offset="0" stop-color="${bgTop}"/>
			<stop offset="1" stop-color="${bgBot}"/>
		</linearGradient>
		<radialGradient id="light" cx="0.32" cy="0.2" r="0.9">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
			<stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="vig" cx="0.5" cy="0.55" r="0.75">
			<stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
			<stop offset="1" stop-color="#3a2a12" stop-opacity="0.22"/>
		</radialGradient>
		<filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
			<feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#3a2a12" flood-opacity="0.22"/>
		</filter>
		${liquidDefs}
	</defs>
	<rect width="400" height="300" fill="url(#bg)"/>
	<rect width="400" height="300" fill="url(#light)"/>
	${steam}
	${art}
	<rect width="400" height="300" fill="url(#vig)"/>
</svg>`;
	return new Response(body, {
		headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' }
	});
}
