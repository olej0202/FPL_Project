/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        royal: {
          red: "#1f2937",
          gold: "#76afa0",
          black: "#0f172a",
          beige: "#dbe5df",
        },
      },
    },
  },
  plugins: [],
};

