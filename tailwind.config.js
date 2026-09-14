/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#080d19',
        },
        accent: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebcff',
          400: '#5998ff',
          500: '#3375ff',
          600: '#1b57f5',
          700: '#1443e1',
          800: '#1739b6',
          900: '#19368f',
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
