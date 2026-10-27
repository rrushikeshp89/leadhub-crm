/** @type {import('tailwindcss').Config} */
// Design tokens sampled from the SchoolHub Figma template. Mirrored for icons/charts in src/lib/theme.ts.
// Every color in the UI must come from here — no hex values in components.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        lavender: { DEFAULT: '#CFCEFF', light: '#F1F0FF', hover: '#BDBBFF', ink: '#6E6BD8' },
        sun: { DEFAULT: '#FAE27C', light: '#FDF6D8', hover: '#F5D957', ink: '#8A6A00' },
        sky: { DEFAULT: '#C3EBFA', light: '#EDF9FD', hover: '#B2E4F7', accent: '#4ABDE8', ink: '#1E8DB8' },
        pink: { DEFAULT: '#FF8BD0', light: '#FFEFF9' },
        ink: '#242424',
        muted: '#8A8D8E',
        faint: '#A7A9AA',
        canvas: '#F7F8FA',
        frame: '#EAEAF3',
        line: { DEFAULT: '#EEF0F2', strong: '#D9DBDD' },
        success: { DEFAULT: '#00997E', light: '#E6F6F2' },
        danger: { DEFAULT: '#FF414B', light: '#FFF0F1', hover: '#FFE0E2' },
        warn: { DEFAULT: '#FFAE41', light: '#FFF6EA' },
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        pop: '0 8px 24px rgba(36,36,36,0.08)',
        soft: '0 1px 2px rgba(36,36,36,0.06)',
      },
    },
  },
  plugins: [],
}
