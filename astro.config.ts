import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

const base = process.env.SITE_BASE || "/";

export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || "https://example.com",
  base,
  trailingSlash: "always",
  vite: { plugins: [tailwindcss()] },
});
