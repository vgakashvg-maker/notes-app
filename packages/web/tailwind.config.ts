import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mirrors the Android theme palette so brand identity stays consistent
        // across surfaces. M15-equivalent design-tokens package will own these.
        brand: {
          DEFAULT: "#3b6cf2",
          fg: "#ffffff",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f4f4f5",
          inverse: "#0b0b0d",
        },
        ink: {
          DEFAULT: "#101015",
          muted: "#525261",
          inverse: "#f4f4f5",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
