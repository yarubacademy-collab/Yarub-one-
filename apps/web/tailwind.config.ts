import type { Config } from 'tailwindcss';

/**
 * YARUB ONE visual identity — dark, professional palette.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#e8eaf0', soft: '#c7cbd6', muted: '#8b93a7' },
        parchment: { DEFAULT: '#0e1117', raised: '#171b24', sunk: '#0a0c10' },
        amber: { DEFAULT: '#3b82f6', bright: '#60a5fa', deep: '#1d4ed8' },
        edge: '#262b36',
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
