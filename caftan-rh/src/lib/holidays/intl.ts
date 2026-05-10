// Jours fériés internationaux et religieux 2026-2028
//
// Les dates islamiques sont basées sur le calendrier Umm al-Qura (Arabie
// Saoudite) ; en pratique, l'observation lunaire en Belgique peut décaler
// la date de ±1 jour. On marque ces entrées avec `confirmed=false` pour le
// rappeler.
//
// Source de vérité officielle pour la Belgique : annonces de l'Exécutif des
// Musulmans de Belgique. Mettre à jour avant chaque échéance.

export type IntlHoliday = {
  date: string; // YYYY-MM-DD
  label: string;
  kind: "religious" | "international";
  tradition: "islamic" | "christian" | "jewish" | "hindu" | "secular";
  priority: 0 | 1 | 2 | 3; // 3 = critique (Aïd) ; 0 = simple info
  country: string | null; // null = global
  notes?: string;
};

export const INTL_HOLIDAYS: IntlHoliday[] = [
  // ============== ISLAMIC — 2026 (1447 H -> 1448 H) ==============
  {
    date: "2026-02-17",
    label: "Début Ramadan 1447",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
    notes: "Mois de jeûne — adapter horaires (pause prière, fin journée plus tôt).",
  },
  {
    date: "2026-03-19",
    label: "Aïd al-Fitr 1447",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
    notes: "Fête de fin du Ramadan — forte demande boutique caftan.",
  },
  {
    date: "2026-03-20",
    label: "Aïd al-Fitr 1447 — j+1",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },
  {
    date: "2026-05-26",
    label: "Aïd al-Adha 1447",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
    notes: "Fête du sacrifice.",
  },
  {
    date: "2026-05-27",
    label: "Aïd al-Adha 1447 — j+1",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },
  {
    date: "2026-06-14",
    label: "Nouvel an hégirien 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 1,
    country: null,
  },
  {
    date: "2026-06-23",
    label: "Achoura 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 1,
    country: null,
  },
  {
    date: "2026-08-24",
    label: "Mawlid 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },

  // ============== ISLAMIC — 2027 (1448 H -> 1449 H) ==============
  {
    date: "2027-02-07",
    label: "Début Ramadan 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },
  {
    date: "2027-03-09",
    label: "Aïd al-Fitr 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },
  {
    date: "2027-03-10",
    label: "Aïd al-Fitr 1448 — j+1",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },
  {
    date: "2027-05-15",
    label: "Aïd al-Adha 1448",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },
  {
    date: "2027-05-16",
    label: "Aïd al-Adha 1448 — j+1",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },
  {
    date: "2027-06-03",
    label: "Nouvel an hégirien 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 1,
    country: null,
  },
  {
    date: "2027-06-12",
    label: "Achoura 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 1,
    country: null,
  },
  {
    date: "2027-08-13",
    label: "Mawlid 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 2,
    country: null,
  },

  // ============== ISLAMIC — 2028 (1449 H -> 1450 H) ==============
  {
    date: "2028-01-27",
    label: "Début Ramadan 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },
  {
    date: "2028-02-25",
    label: "Aïd al-Fitr 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },
  {
    date: "2028-05-03",
    label: "Aïd al-Adha 1449",
    kind: "religious",
    tradition: "islamic",
    priority: 3,
    country: null,
  },

  // ============== INTERNATIONAL CIVILS ==============
  {
    date: "2026-03-08",
    label: "Journée internationale des droits des femmes",
    kind: "international",
    tradition: "secular",
    priority: 1,
    country: null,
  },
  {
    date: "2027-03-08",
    label: "Journée internationale des droits des femmes",
    kind: "international",
    tradition: "secular",
    priority: 1,
    country: null,
  },
  {
    date: "2028-03-08",
    label: "Journée internationale des droits des femmes",
    kind: "international",
    tradition: "secular",
    priority: 1,
    country: null,
  },

  // ============== AUTRES TRADITIONS ==============
  {
    date: "2026-02-17",
    label: "Nouvel an chinois (Cheval de feu)",
    kind: "international",
    tradition: "secular",
    priority: 0,
    country: null,
  },
  {
    date: "2027-02-06",
    label: "Nouvel an chinois (Chèvre)",
    kind: "international",
    tradition: "secular",
    priority: 0,
    country: null,
  },

  // Hanoukka 2026 : 4 déc -> 12 déc — on marque le 1er jour
  {
    date: "2026-12-04",
    label: "Hanoukka — 1er jour",
    kind: "religious",
    tradition: "jewish",
    priority: 0,
    country: null,
  },
  // Roch Hachana 2026
  {
    date: "2026-09-12",
    label: "Roch Hachana 5787",
    kind: "religious",
    tradition: "jewish",
    priority: 0,
    country: null,
  },
  // Yom Kippour 2026
  {
    date: "2026-09-21",
    label: "Yom Kippour 5787",
    kind: "religious",
    tradition: "jewish",
    priority: 0,
    country: null,
  },
  // Diwali 2026
  {
    date: "2026-11-08",
    label: "Diwali",
    kind: "religious",
    tradition: "hindu",
    priority: 0,
    country: null,
  },
  {
    date: "2027-10-28",
    label: "Diwali",
    kind: "religious",
    tradition: "hindu",
    priority: 0,
    country: null,
  },

  // Noël orthodoxe
  {
    date: "2026-01-07",
    label: "Noël orthodoxe",
    kind: "religious",
    tradition: "christian",
    priority: 0,
    country: null,
  },
  {
    date: "2027-01-07",
    label: "Noël orthodoxe",
    kind: "religious",
    tradition: "christian",
    priority: 0,
    country: null,
  },
];
