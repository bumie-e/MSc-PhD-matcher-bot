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
      },
    },
  },
  plugins: [],
};

export default config;
