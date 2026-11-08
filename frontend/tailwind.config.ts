import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f5f0",
        surface: "#ffffff",
        "surface-2": "#f0ede6",
        border: "#ddd9d0",
        ink: "#141210",
        muted: "#7a7060",
        accent: "#1e3a6e",
        signal: "#d97706",
        "signal-green": "#2d6a4f",
        brand: "#1d4ed8",
        "brand-deep": "#1e3a8a",
        "brand-soft": "#eaf1ff",
        "brand-mid": "#c9dcff",
      },
      fontFamily: {
        sans: ["Calibri", "var(--font-carlito)", "Carlito", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
