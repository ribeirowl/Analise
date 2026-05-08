import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        "surface-2": "#334155",
        accent: "#22c55e",
        "accent-dim": "#16a34a",
        muted: "#64748b",
        danger: "#ef4444",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};

export default config;
