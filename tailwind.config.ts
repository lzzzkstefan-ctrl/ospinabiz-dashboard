import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Cores e fonte copiadas do masterview (só o visual). Os valores ficam em app/globals.css.
export default {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--bg-rgb) / <alpha-value>)",
        foreground: "var(--ink)",
        card: { DEFAULT: "var(--bg-raised)", foreground: "var(--ink)" },
        popover: { DEFAULT: "var(--bg-raised)", foreground: "var(--ink)" },
        primary: { DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)", foreground: "var(--bg)" },
        secondary: { DEFAULT: "var(--bg-raised-2)", foreground: "var(--ink)" },
        muted: { DEFAULT: "var(--bg-raised-2)", foreground: "var(--ink-dim)" },
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          foreground: "var(--bg)",
          2: "var(--accent-2)",
          3: "rgb(var(--accent-3-rgb) / <alpha-value>)",
        },
        destructive: { DEFAULT: "rgb(var(--accent-3-rgb) / <alpha-value>)", foreground: "var(--bg)" },
        border: "var(--line)",
        input: "var(--line)",
        ring: "rgb(var(--accent-rgb) / <alpha-value>)",
        "bg-raised": "var(--bg-raised)",
        "bg-raised-2": "var(--bg-raised-2)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        "ink-faint": "var(--ink-faint)",
        "line-soft": "var(--line-soft)",
      },
      fontFamily: {
        serif: ["var(--font-outfit)", "system-ui", "sans-serif"],
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 6px)",
        sm: "calc(var(--radius) - 12px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
