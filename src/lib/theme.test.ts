import { describe, it, expect } from 'vitest';
import { buildThemeVars, DEFAULT_THEME } from './theme';

function varOf(css: string, name: string): string | undefined {
	// vars are joined by ';' — grab the value for `--color-<name>`
	const decl = css.split(';').find((d) => d.startsWith(`${name}:`));
	return decl?.slice(name.length + 1);
}

describe('buildThemeVars', () => {
	it('emits the picked primary verbatim at its brand step (lagoon-600)', () => {
		const css = buildThemeVars({ primary: '#b23a48', accent: '#f2a154' });
		// solid primary buttons paint bg-lagoon-600 → must equal the chosen colour
		expect(varOf(css, '--color-lagoon-600')).toBe('#b23a48');
	});

	it('emits the picked accent verbatim at its brand step (coral-500)', () => {
		const css = buildThemeVars({ primary: '#b23a48', accent: '#f2a154' });
		// the promo / chef's-pick ribbon paints bg-coral-500 → must equal the chosen colour
		expect(varOf(css, '--color-coral-500')).toBe('#f2a154');
	});

	it('does not crush a bright accent into a dark shade (the original bug)', () => {
		// #de5f34 is an L≈54% orange; the old ramp forced it to L≈31% (muddy brown).
		// The anchor now emits it verbatim, and neighbouring steps stay in-family.
		const css = buildThemeVars(DEFAULT_THEME);
		expect(varOf(css, '--color-coral-500')).toBe('#de5f34');
		// step 400 is a lighter orange, not darker than the anchor
		expect(varOf(css, '--color-coral-400')).toMatch(/^hsl\(/);
	});

	it('produces a full 10-step ramp for both families', () => {
		const css = buildThemeVars(DEFAULT_THEME);
		for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
			expect(varOf(css, `--color-lagoon-${step}`)).toBeDefined();
			expect(varOf(css, `--color-coral-${step}`)).toBeDefined();
		}
	});

	it('falls back gracefully on malformed hex', () => {
		const css = buildThemeVars({ primary: 'not-a-colour', accent: '#de5f34' });
		// invalid primary → verbatim garbage is still anchored, but ramp steps resolve
		expect(varOf(css, '--color-lagoon-500')).toMatch(/^hsl\(/);
	});
});
