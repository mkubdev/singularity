import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * Absolute site URL for Open Graph / canonical tags (share crawlers require absolute
 * URLs). On Vercel this is the project's production domain: the vercel.app address
 * today, the custom domain automatically once it is attached. SITE_URL overrides it.
 */
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "https://maximekubik.fr"
).replace(/\/$/, "")

const siteUrlPlugin = (): Plugin => ({
  name: "site-url",
  transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
})

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrlPlugin()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
})
