/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--ink)",
          50: "var(--card)",
          100: "var(--card)",
          200: "var(--border)",
          300: "var(--fade)",
          400: "var(--fade)",
          500: "var(--mild)",
          600: "var(--mild)",
          700: "var(--ink)",
          800: "var(--border)",
          900: "var(--ink)",
          950: "var(--bg)",
        },
        accent: {
          DEFAULT: "var(--yellow)",
          soft: "var(--yellow)",
          deep: "var(--ink)",
        },
        yellow: "var(--yellow)",
        cream: "var(--bg)",
        ember: {
          50: "var(--card)",
          100: "var(--card)",
          200: "var(--yellow)",
          500: "var(--yellow)",
          600: "var(--yellow)",
          700: "var(--ink)",
          900: "var(--bg)",
        },
      },
      fontFamily: {
        sans: [
          "IBM Plex Sans", "PingFang SC", "Microsoft YaHei", "sans-serif",
        ],
        serif: [
          "Noto Serif SC", "Source Serif 4", "Georgia", "serif",
        ],
        mono: [
          "IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace",
        ],
      },
      boxShadow: {
        hard: "var(--shadow)",
        "hard-sm": "var(--shadow-sm)",
        "hard-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};
