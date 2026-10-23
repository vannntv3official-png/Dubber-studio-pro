/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "Kantumruy Pro",
          "Noto Sans Khmer",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif"
        ],
      },
      colors: {
        studio: {
          950: "#09090b",
          900: "#121217",
          850: "#181820",
          800: "#22222e",
          700: "#2e2e3d",
        }
      }
    },
  },
  plugins: [],
}
