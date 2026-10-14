/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      // Visual tokens live as CSS variables in app/globals.css; Tailwind only
      // supplies a few layout utilities, so map its families to the same stack.
      fontFamily: {
        sans: ["var(--ff-sans)"],
        mono: ["var(--ff-mono)"],
      },
    },
  },
  plugins: [],
};
