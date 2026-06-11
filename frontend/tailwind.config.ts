import type { Config } from "tailwindcss";

// Tailwind v4 主题在 styles.css 的 @theme 中定义；此处仅声明扫描范围。
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
} satisfies Config;
