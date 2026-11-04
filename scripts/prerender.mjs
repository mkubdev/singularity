/**
 * Post-build step: makes the site readable without JavaScript (search engines and AI
 * crawlers such as GPTBot, ClaudeBot or PerplexityBot don't run it).
 *
 * - renders the React app to static HTML inside #root (the client hydrates it)
 * - adds JSON-LD structured data (ProfessionalService + Person)
 * - writes robots.txt, sitemap.xml and llms.txt
 *
 * The site URL follows the same rule as vite.config.ts: SITE_URL, else Vercel's
 * production domain, else https://maximekubik.fr.
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const ssrDir = path.join(root, "dist-ssr")

const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "https://maximekubik.fr"
).replace(/\/$/, "")

const entry = fs.readdirSync(ssrDir).find((f) => f.startsWith("entry-server") && f.endsWith(".js"))
const { render, site } = await import(pathToFileURL(path.join(ssrDir, entry)).href)

const name = `${site.firstName} ${site.lastName}`
const today = new Date().toISOString().slice(0, 10)

// ---- Static HTML ---------------------------------------------------------------
const indexPath = path.join(dist, "index.html")
let html = fs.readFileSync(indexPath, "utf8")
if (!html.includes('<div id="root"></div>')) throw new Error("prerender: #root placeholder not found")
html = html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`)

// ---- Structured data -------------------------------------------------------------
const person = {
  "@type": "Person",
  "@id": `${siteUrl}/#person`,
  name,
  jobTitle: site.role,
  description: site.about,
  url: `${siteUrl}/`,
  email: `mailto:${site.email}`,
  image: `${siteUrl}/og.jpg`,
  address: { "@type": "PostalAddress", addressLocality: site.location.city, addressRegion: site.location.region, addressCountry: site.location.country },
  sameAs: site.links.map((l) => l.href),
  knowsAbout: [...site.services.map((s) => s.title), "Développement web", "Développement fullstack", "Architecture logicielle"],
}
const service = {
  "@type": "ProfessionalService",
  "@id": `${siteUrl}/#service`,
  name,
  description: site.about,
  url: `${siteUrl}/`,
  email: site.email,
  image: `${siteUrl}/og.jpg`,
  founder: { "@id": `${siteUrl}/#person` },
  address: person.address,
  areaServed: [
    { "@type": "City", name: site.location.city },
    { "@type": "AdministrativeArea", name: site.location.region },
    { "@type": "Country", name: "France" },
  ],
  sameAs: person.sameAs,
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Services",
    itemListElement: site.services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.title, description: s.text, provider: { "@id": `${siteUrl}/#person` } },
    })),
  },
}
const website = { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: `${siteUrl}/`, name, inLanguage: "fr-FR", publisher: { "@id": `${siteUrl}/#person` } }
const ld = { "@context": "https://schema.org", "@graph": [website, person, service] }
html = html.replace("</head>", `    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`)
fs.writeFileSync(indexPath, html)

// ---- Crawler files -------------------------------------------------------------
fs.writeFileSync(
  path.join(dist, "robots.txt"),
  `# Search engines and AI assistants are welcome.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`,
)

fs.writeFileSync(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
)

fs.writeFileSync(
  path.join(dist, "llms.txt"),
  `# ${name}

> ${site.role} basé à ${site.location.city} (${site.location.region}). Applications, solutions, intelligence artificielle et sites web sur mesure, de l'idée à la mise en ligne.

${site.about}

## Services
${site.services.map((s) => `- **${s.title}** : ${s.text}`).join("\n")}

## Méthode : ${site.approach.title.replace(/\.$/, "")}
${site.approach.steps.map((s, i) => `${i + 1}. **${s.name}** : ${s.detail}`).join("\n")}

## Contact
- E-mail : ${site.email}
- Réponse sous 48 heures
- Zone : ${site.location.city}, ${site.location.region} et toute la France
${site.links.map((l) => `- ${l.label} : ${l.href}`).join("\n")}

## Pages
- [Accueil](${siteUrl}/) : présentation, services, méthode et contact (page unique)
`,
)

fs.rmSync(ssrDir, { recursive: true, force: true })
console.log(`prerender: ${siteUrl} — HTML, JSON-LD, robots.txt, sitemap.xml, llms.txt`)
