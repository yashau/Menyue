// Turn a brand base colour into a coherent 50–900 ramp of CSS-variable
// overrides. Tailwind v4 utilities compile to `var(--color-<name>-<step>)`,
// so overriding these variables re-skins the whole app from one setting.
//
// The ramp is *anchored*: the colour the admin picks is emitted verbatim at
// its brand step (primary → lagoon-600, accent → coral-500) — the exact steps
// the customer menu paints solid buttons and the promo ribbon with — so what
// you choose is what you see. Lighter/darker steps are derived around that
// anchor by walking lightness toward fixed pale/deep endpoints while keeping
// the picked hue, and easing saturation down into the tints. Earlier this used
// one fixed lightness curve for both colours, which crushed bright accents
// (e.g. #de5f34, an L≈54% orange) down to a muddy L≈31% brown — so the menu
// never showed the chosen accent at all.

export interface Theme {
	primary: string;
	accent: string;
}

export const DEFAULT_THEME: Theme = { primary: '#0d6d5b', accent: '#de5f34' };

function hexToHsl(hex: string): { h: number; s: number; l: number } {
	let c = hex.replace('#', '').trim();
	if (c.length === 3) c = c.split('').map((x) => x + x).join('');
	if (!/^[0-9a-fA-F]{6}$/.test(c)) return { h: 168, s: 78, l: 24 }; // fallback lagoon
	const r = parseInt(c.slice(0, 2), 16) / 255;
	const g = parseInt(c.slice(2, 4), 16) / 255;
	const b = parseInt(c.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h = 0;
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: s * 100, l: l * 100 };
}

const STEP_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const LIGHT_L = 96; // lightness of the palest step (50)
const DARK_L = 10; // lightness of the deepest step (900)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Build a 10-step ramp for `name`, emitting the picked colour verbatim at
// `anchorStep` and interpolating the rest around it.
function ramp(name: string, hex: string, anchorStep: number): string {
	const { h, s, l } = hexToHsl(hex);
	const sat = clamp(s, 25, 92); // avoid greyed-out or neon ramps, but stay faithful
	const a = STEP_KEYS.indexOf(anchorStep);
	return STEP_KEYS.map((step, i) => {
		if (step === anchorStep) return `--color-${name}-${step}:${hex}`; // exact match
		let L: number, stepSat = sat;
		if (i < a) {
			// lighter than the anchor: walk lightness up toward the pale endpoint
			L = LIGHT_L + (l - LIGHT_L) * (i / a);
			// ease saturation down into the tints so pale steps don't read neon
			stepSat = sat * (1 - 0.45 * ((a - i) / a));
		} else {
			// darker than the anchor: walk lightness down toward the deep endpoint
			L = l + (DARK_L - l) * ((i - a) / (STEP_KEYS.length - 1 - a));
		}
		return `--color-${name}-${step}:hsl(${h.toFixed(0)} ${stepSat.toFixed(0)}% ${L.toFixed(0)}%)`;
	}).join(';');
}

export function buildThemeVars(theme: Theme): string {
	// Anchors mirror how the app paints its brand: solid primary buttons use
	// lagoon-600, the promo / "chef's pick" ribbon uses coral-500.
	return `${ramp('lagoon', theme.primary, 600)};${ramp('coral', theme.accent, 500)}`;
}
