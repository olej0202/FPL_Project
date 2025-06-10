/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        royal: {
          red: '#5A0000',     // Darker red
          gold: '#B8860B',    // Bright gold
          black: '#000000',
          beige: '#f7ead6',
        },
      },
    },
  },
  plugins: [],
};
