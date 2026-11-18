import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#070b12", 900: "#0b111b", 850: "#0f1724", 800: "#131c2b", 700: "#1c2738", 600: "#2a3850", 500: "#3d4e6b" },
        mist: { 100: "#e8edf5", 300: "#aab6c8", 400: "#8291a8", 500: "#5f6e86" },
        gain: { DEFAULT: "#22c55e", soft: "#0f2a1c" },
        loss: { DEFAULT: "#f43f5e", soft: "#2c1219" },
        brand: { DEFAULT: "#f5b93a", soft: "#2b2311" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
