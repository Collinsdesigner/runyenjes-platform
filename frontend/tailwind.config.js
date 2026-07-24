/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // These now read from CSS variables (set in index.css, and updated
        // live at runtime from Admin Settings) instead of fixed hex values —
        // so every existing "bg-rgreen"/"text-rgreen"/etc. class across the
        // whole app automatically reflects whatever color is saved in the
        // database, with zero changes needed to individual pages.
        rgreen: 'var(--color-primary)',
        rmaroon: 'var(--color-secondary)',
      },
    },
  },
  plugins: [],
};
