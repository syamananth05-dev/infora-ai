/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#faf9f7',
          100: '#f2f0eb',
          200: '#e4e1d9',
          300: '#cdc8bd',
          400: '#9a948a',
          500: '#6b665d',
          600: '#4d4941',
          700: '#36322b',
          800: '#242019',
          850: '#1b1815',
          900: '#151310',
          950: '#0d0b09',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#ff9a45',
          500: '#ff7a1a',
          600: '#f05e00',
          700: '#c24708',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 8px 24px -8px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
