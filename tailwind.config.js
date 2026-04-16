/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#00e5a0', dark: '#00b37a' },
        orange: { DEFAULT: '#ff6b35' },
        surface: { 1: '#0a0c10', 2: '#111418', 3: '#1a1f27', 4: '#222834' },
        border: { DEFAULT: '#2a3040', light: '#3a4455' },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
