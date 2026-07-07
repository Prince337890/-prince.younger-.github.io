/** @type {import('tailwindcss').Config} */

// ---------------------------------------------------------------------------
// Night Haul theme layer.
//
// Every color below resolves to a CSS custom property holding a raw RGB
// channel triplet (e.g. `--tw-slate-800: 30 25 18`), defined per-theme in
// App.jsx (FM_THEME_CSS) on `:root[data-theme="nighthaul"|"classic"]`.
// That lets the ~1,700 existing `slate-*` / `amber-*` class usages flip
// between the Night Haul (warm dark + gold) and Classic (stock slate/amber)
// skins with NO changes to the JSX.
//
// CRITICAL: the `rgb(var(--…) / <alpha-value>)` wrapper is what keeps
// opacity modifiers (`bg-slate-800/40`, `ring-amber-500/20`, gradients…)
// working app-wide. Do not swap these for plain hex values.
// ---------------------------------------------------------------------------
const twVar = (name) => `rgb(var(--tw-${name}) / <alpha-value>)`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name, shades = SHADES) =>
  Object.fromEntries(shades.map((s) => [s, twVar(`${name}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // Type pairing (Night Haul): Inter Tight for UI, IBM Plex Mono for data.
    // The stacks live in per-theme CSS variables so Classic keeps today's
    // system-font look; the var() fallbacks are the pre-theme safety net.
    fontFamily: {
      sans: 'var(--fm-font-sans, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji")',
      serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      mono: 'var(--fm-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      // `font-data` = numeric/stat content. Night Haul points this at the
      // mono stack; Classic aliases it to the sans stack (today's look).
      // Tabular numerals come from the companion .font-data rule in App.jsx.
      data: 'var(--fm-font-data, inherit)',
    },
    // Radius system rides CSS variables too: Night Haul is slightly softer,
    // Classic pins the stock Tailwind values. Fallbacks = stock Tailwind.
    borderRadius: {
      none: '0px',
      sm: 'var(--fm-r-sm, 0.125rem)',
      DEFAULT: 'var(--fm-r, 0.25rem)',
      md: 'var(--fm-r-md, 0.375rem)',
      lg: 'var(--fm-r-lg, 0.5rem)',
      xl: 'var(--fm-r-xl, 0.75rem)',
      '2xl': 'var(--fm-r-2xl, 1rem)',
      '3xl': '1.5rem',
      full: '9999px',
    },
    extend: {
      colors: {
        // Full scales so no existing shade silently drops out of the build.
        white: twVar('white'),
        slate: scale('slate'),
        amber: scale('amber'),
        emerald: scale('emerald'), // status: ok / money
        red: scale('red'),         // status: bad / danger
        blue: scale('blue'),       // status: info
        // `warn` is the decoupled warning hue — coral in Night Haul, amber
        // in Classic — so warnings never borrow the brand gold.
        warn: scale('warn', [100, 200, 300, 400, 500, 600]),
        // Named depth system for primitives (Phase 3 adoption): page → card
        // → raised → overlay.
        surface: {
          0: twVar('s0'),
          1: twVar('s1'),
          2: twVar('s2'),
          3: twVar('s3'),
        },
        hairline: twVar('hairline'),
        // The deep end of the page-background gradient (was hardcoded #0b1220).
        pagedeep: twVar('pagedeep'),
      },
      // Elevation shadows: subtle inner highlight + drop in Night Haul,
      // disabled (0 0 #0000) in Classic so "off" really means today's look.
      boxShadow: {
        e1: 'var(--fm-shadow-1, 0 0 #0000)',
        e2: 'var(--fm-shadow-2, 0 0 #0000)',
      },
    },
  },
  plugins: [],
};
