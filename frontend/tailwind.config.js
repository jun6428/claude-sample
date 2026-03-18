/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'landscape': { 'raw': '(orientation: landscape) and (max-width: 1023px)' },
      },
      colors: {
        wood: '#228B22',
        brick: '#8B4513',
        sheep: '#90EE90',
        wheat: '#FFD700',
        ore: '#708090',
        desert: '#F4A460',
      },
    },
  },
  plugins: [],
}
