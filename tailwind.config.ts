import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif'],
      },
      colors: {
        paper: '#FDFCFB',
        'teal-deep': '#134E4A',
        'gold-antique': '#92400E',
        'dark-bg': '#0F172A',
        'dark-paper': '#1E293B',
        'dark-teal': '#2DD4BF',
        'dark-gold': '#FBBF24',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
