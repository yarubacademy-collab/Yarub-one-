import type { Config } from 'tailwindcss';

/**
 * YARUB ONE visual identity.
 *
 * Deliberately not the grey-on-white or purple-gradient look of existing AI
 * products: a warm parchment base with deep ink and a single amber accent,
 * drawn from manuscript tradition rather than dashboard convention.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#16181d', soft: '#2b2f38', muted: '#5c6270' },
        parchment: { DEFAULT: '#faf7f0', raised: '#ffffff', sunk: '#f2efe9' },
        amber: { DEFAULT: '#c08a2e', bright: '#e0a944', deep: '#8f6519' },
        edge: '#e3ded2',
        danger: '#b23b3b',
      },
      fontFamily: {
        arabic: ['var(--font-arabic)', 'sans-serif'],
        urdu: ['var(--font-urdu)', 'serif'],
        latin: ['var(--font-latin)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
      boxShadow: { raise: '0 1px 2px rgba(22,24,29,.06), 0 8px 24px rgba(22,24,29,.06)' },
    },
  },
  plugins: [],
} satisfies Config;
