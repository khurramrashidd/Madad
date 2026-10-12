/** @type {import('tailwindcss').Config} */

/**
 * Dark mode without touching thirteen page components.
 *
 * The app's surfaces are drawn with the `ink` ramp and `bg-white`. Adding a
 * `dark:` variant to every one of those would mean editing every file and
 * remembering to do it again on every new screen — a rule nobody keeps.
 *
 * Instead the ramp itself is made of CSS variables, and dark mode redefines
 * them. `bg-ink-50` is a token meaning "page background", not a fixed grey,
 * so one block of variables repaints the entire app and any component written
 * later inherits it for free. `surface` replaces the literal `bg-white` for
 * the same reason.
 *
 * Brand, money and status colours are NOT variables: a green that means
 * "paid" and an amber that means "money" must not drift between themes.
 */
const ramp = (name) => ({
  50: `rgb(var(--${name}-50) / <alpha-value>)`,
  100: `rgb(var(--${name}-100) / <alpha-value>)`,
  200: `rgb(var(--${name}-200) / <alpha-value>)`,
  300: `rgb(var(--${name}-300) / <alpha-value>)`,
  400: `rgb(var(--${name}-400) / <alpha-value>)`,
  500: `rgb(var(--${name}-500) / <alpha-value>)`,
  600: `rgb(var(--${name}-600) / <alpha-value>)`,
  700: `rgb(var(--${name}-700) / <alpha-value>)`,
  800: `rgb(var(--${name}-800) / <alpha-value>)`,
  900: `rgb(var(--${name}-900) / <alpha-value>)`,
  950: `rgb(var(--${name}-950) / <alpha-value>)`,
});

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /** Card / sheet / header background. Was a literal `white`. */
        surface: 'rgb(var(--surface) / <alpha-value>)',
        /** One step up from the page, for inset rows and inputs. */
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        // Primary = "trust green". Verified, paid, go. Deliberately not another
        // SaaS blue — this is a payments-and-trust product, and green carries
        // both meanings at once.
        brand: {
          50: '#ECFDF5', 100: '#D1F7E7', 200: '#A7EFCF', 300: '#6FE1B2',
          400: '#34CD92', 500: '#12A66E', 600: '#0B8A5B', 700: '#0A6E4A',
          800: '#0A573C', 900: '#093F2D', 950: '#032218',
        },
        // Reserved for money only — the ₹ bounty. A single warm signal kept
        // from Madad's original identity, now with one clear job.
        money: {
          50: '#FFF8EB', 100: '#FDECC8', 200: '#FBD894', 300: '#F9C156',
          400: '#F5A623', 500: '#E08B07', 600: '#B86E05', 700: '#935507',
        },
        // Cool-neutral ink ramp — the quiet backdrop the green sits on.
        // Values live in src/styles/index.css and invert for dark mode.
        ink: ramp('ink'),
        success: '#12A66E',
        danger: '#E5484D',
        warn: '#E08B07',
        info: '#3B74E8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        // 360px is the width of the cheap Android handsets this app is aimed
        // at, and the header fits the user's name from there up. Below it —
        // an older 320px device — the name is dropped and the avatar alone
        // identifies the account.
        xs: '360px',
      },
      letterSpacing: {
        tightish: '-0.011em',
        tighter2: '-0.02em',
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pop-in': 'popIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-ring': 'pulseRing 1.9s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.5s linear infinite',
      },
      keyframes: {
        slideInLeft: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        slideUp: { '0%': { transform: 'translateY(16px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        popIn: { '0%': { transform: 'scale(0.95)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        pulseRing: { '0%': { transform: 'scale(0.85)', opacity: 0.7 }, '70%': { transform: 'scale(1.7)', opacity: 0 }, '100%': { opacity: 0 } },
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.05)',
        soft: '0 2px 8px -2px rgba(16,24,40,0.08), 0 4px 16px -4px rgba(16,24,40,0.06)',
        lift: '0 12px 32px -12px rgba(16,24,40,0.20)',
        'brand-glow': '0 6px 20px -6px rgba(11,138,91,0.45)',
      },
    },
  },
  plugins: [],
};
