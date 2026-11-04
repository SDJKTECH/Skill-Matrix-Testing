// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // ✅ use class-based dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // ✅ include all React components
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
