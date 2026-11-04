// Tout le texte du site est ici. Modifie ce fichier pour changer le contenu.

export const site = {

  firstName: "Maxime",
  lastName: "Kubik",
  role: "Ingénieur logiciel",
  intro: "Je conçois et développe des sites, des applications et des outils sur mesure.",
  email: "mkubdev@proton.me",
  links: [] as { label: string; href: string }[],

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
