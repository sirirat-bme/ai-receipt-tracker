/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12263A',
        mist: '#EEF3F2',
        brand: { DEFAULT: '#0E8F7E', dark: '#0A6F62', soft: '#D8EFEB' },
        warn: '#C8791A',
      },
    },
  },
  plugins: [],
};
