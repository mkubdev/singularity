// Tout le texte du site est ici. Modifie ce fichier pour changer le contenu.

export const site = {

  firstName: "Maxime",
  lastName: "Kubik",
  role: "Ingénieur logiciel",
  intro: "Je conçois et développe des sites, des applications et des outils sur mesure.",
  email: "mkubdev@proton.me",
  links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/maximekbk/" }] as { label: string; href: string }[],

  location: { city: "Lyon", region: "Auvergne-Rhône-Alpes", country: "FR" },

  // Factual self-contained presentation: read by search engines and AI assistants
  // (JSON-LD and /llms.txt). Keep it accurate; it is what they will quote.
  about:
    "Maxime Kubik est ingénieur logiciel, basé à Lyon, en Auvergne-Rhône-Alpes. Depuis dix ans, il conçoit et développe des logiciels de bout en bout : applications web et mobiles sur mesure (espaces clients, plateformes métier, SaaS), solutions d'automatisation et d'intégration entre outils, projets d'intelligence artificielle (assistants, agents et automatisations branchés sur les données et les outils d'une entreprise) et sites web rapides, accessibles et bien référencés. Il accompagne chaque projet de l'idée à la mise en ligne, puis dans la durée : conception, développement, déploiement et évolutions, avec un seul interlocuteur pour toute la chaîne technique. Il choisit les technologies après avoir compris le besoin, sans dogme, pour livrer des produits rapides, lisibles et durables. Il travaille avec des entreprises de la région lyonnaise et de toute la France. Pour un projet, on peut le contacter par e-mail ; il répond sous 48 heures.",

  manifesto: {
    lead: "Dix ans à concevoir des logiciels de bout en bout.",
    body: "Je choisis la technologie après avoir compris le problème, pas avant. Le résultat : des produits rapides, lisibles, et qui tiennent dans la durée.",
  },

  services: [
    {
      title: "Applications sur mesure",
      kanji: "創",
      text: "Applications web et mobiles construites autour de vos usages : espaces clients, plateformes métier, SaaS.",
    },
    {
      title: "Solutions sur mesure",
      kanji: "解",
      text: "Automatisations, intégrations entre vos outils, API, traitement de données. Ce qui manque à votre système.",
    },
    {
      title: "Intelligence artificielle",
      kanji: "知",
      text: "Assistants, agents et automatisations propulsés par l'IA, branchés sur vos données et vos outils.",
    },
    {
      title: "Sites web",
      kanji: "網",
      text: "Sites vitrines, éditoriaux ou e-commerce. Rapides, accessibles, bien référencés et simples à faire vivre.",
    },
  ],

  approach: {
    title: "De l'idée à la mise en ligne.",
    text: "Un seul interlocuteur pour concevoir, développer et faire évoluer votre projet.",
    steps: [
      { name: "Idée", detail: "Comprendre le besoin, cadrer le périmètre." },
      { name: "Conception", detail: "Architecture, parcours, choix techniques." },
      { name: "Développement", detail: "Code, tests, itérations courtes." },
      { name: "Mise en ligne", detail: "Déploiement, suivi, évolutions." },
    ],
  },

  contact: {
    title: "Un projet en tête ?",
    text: "Décrivez-le en quelques lignes. Je réponds sous 48 heures.",
  },
}
