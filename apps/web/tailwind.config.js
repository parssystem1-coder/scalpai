/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rose: {
          glow: 'var(--rose-glow)',
          core: 'var(--rose-core)',
          deep: 'var(--rose-deep)',
        },
        gold: {
          amber: 'var(--gold-amber)',
        },
        champagne: 'var(--champagne)',
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        }
      },
      // WEAKNESSES M18 - these may only name families index.html actually loads.
      // They used to reference Cormorant Garamond and Plus Jakarta Sans, which the
      // Google Fonts stylesheet supplied; with the CDN gone those names resolve to
      // nothing and every heading silently falls back.
      fontFamily: {
        serif: ['var(--font-display)', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['var(--font-ui)', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        btn: 'var(--radius-btn)',
      }
    },
  },
  plugins: [],
}
