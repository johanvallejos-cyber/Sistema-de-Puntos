/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",        // ✅ Sin "src"
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // ✅ Sin "src"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
        heading: ['var(--font-poppins)'], 
      },
    },
  },
  plugins: [],
};