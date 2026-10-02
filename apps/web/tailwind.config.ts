import type { Config } from 'tailwindcss';

/**
 * YARUB Academy visual identity.
 *
 * Every value here is read directly from the academy's own logo
 * (apps/web/public/IMG-20261002-WA0021.jpg) rather than chosen separately:
 * the gold of its calligraphy, the deep green of its small accent marks, and
 * the warm near-black the whole dark theme is built from. Token names are
 * unchanged from before (ink/parchment/amber/edge), so every component that
 * already reads them picks up the new palette automatically.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#f0ead6', soft: '#d8cba8', muted: '#9c9184' },
        parchment: { DEFAULT: '#141210', raised: '#1f1c18', sunk: '#0d0b09' },
        // The logo's gold calligraphy.
        amber: { DEFAULT: '#c09030', bright: '#e0b050', deep: '#8b6420' },
        // The logo's small dark-green accent marks — used sparingly, e.g. a
        // success state, alongside the gold rather than instead of it.
        sage: { DEFAULT: '#306050', bright: '#4a8a72' },
        edge: '#2e2a22',
        danger: '#f87171',
      },
      fontFamily: {
        arabic: ['var(--font-arabic)', 'sans-serif'],
        urdu: ['var(--font-urdu)', 'serif'],
        latin: ['var(--font-latin)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
      boxShadow: { raise: '0 1px 2px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.35)' },
    },
  },
  plugins: [],
} satisfies Config;
