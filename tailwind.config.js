/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs', './public/js/**/*.js', './src/lib/**/*.js'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FCF5EA', 50: '#FEFBF6', 100: '#FCF5EA', 200: '#F6E8D4', 300: '#EBD5B8' },
        terra: { DEFAULT: '#B4562B', 50: '#FBF0E9', 100: '#F6DFD0', 200: '#EBBFA2', 400: '#CB7446', 500: '#B4562B', 600: '#9C4623', 700: '#7F381C' },
        cocoa: { DEFAULT: '#3B2418', 700: '#4F3324', 500: '#7A5B4A', 400: '#9A7E6C', 300: '#C2AC9C' },
      },
      fontFamily: {
        serif: ['"Young Serif"', 'Georgia', 'serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: { soft: '0 10px 30px -12px rgba(92, 51, 23, 0.25)' },
    },
  },
  plugins: [],
};
