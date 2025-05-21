/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontWeight: {
        bold: '700',
        medium: '500',
        regular: '400',
        light: '300',
        semibold: '600',
      },
    },
  },
  plugins: [],
}