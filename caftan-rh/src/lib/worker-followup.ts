// Karim 2026-07-08 : ACCOMPAGNEMENT AUTOMATIQUE du travailleur PAR PALIERS.
//
// Deux phases, cadence pilotée par le cron /api/cron/worker-followup :
//   - PHASE 1 — 4 premières semaines : un mail tous les 7 jours (J+7/14/21/28).
//     Ton : féliciter les premières contributions ; on est contents qu'il prenne
//     nos consignes au sérieux et « au premier degré » ; reconnaissance des
//     efforts d'intégration. Rappel SUBTIL : la 1ʳᵉ semaine (mise à niveau
//     ponctuelle) est passée, on compte désormais sur TOUS ses talents pour
//     atteindre un NOUVEAU palier de performance, qu'on continue de MESURER.
//   - PHASE 2 — au-delà d'1 mois : un mail tous les 10 jours (dès J+38). Ton
//     adapté à un travailleur EXPÉRIMENTÉ : les exigences internes doivent
//     ÉGALER sa performance, qui ne doit jamais stagner ni décroître. Bloc
//     PERSONNALISÉ à partir des notes hebdo (weekly_employee_ratings) accumulées,
//     sinon fallback élégant.
//
// Envoi AUTOMATIQUE assumé par Karim (comme welcome/onboarding-sheet) : source
// `worker_followup` en liste blanche du kill-switch (outbound-guard.ts).
// Best-effort : ne throw JAMAIS. Anti-doublon strict via la table
// worker_followups (unique (employee_id, milestone)).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISOInBrussels, daysBetweenISO, addDaysISO } from "@/lib/datetime";

export const SOURCE = "worker_followup";
export type Phase = "p1" | "p2" | "renewal" | "end";

function firstNameOf(fullName: string | null | undefined): string {
  const n = (fullName ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** FR par défaut ; NL uniquement si la locale commence par « nl ». */
function pickLang(languageCode: string | null | undefined): "fr" | "nl" {
  return (languageCode ?? "").toLowerCase().startsWith("nl") ? "nl" : "fr";
}

// ---------------------------------------------------------------------------
// Personnalisation Phase 2 : synthèse des notes hebdo (weekly_employee_ratings).
// ---------------------------------------------------------------------------

interface Perso {
  /** moyenne /5 sur les semaines récentes, ou null si aucune note. */
  avg: number | null;
  weeks: number;
  /** remarques récentes exploitables (comment non vide), 0 à 2. */
  comments: string[];
}

async function loadPerso(admin: SupabaseClient, employeeId: string): Promise<Perso> {
  try {
    const since = new Date(Date.now() - 84 * 86_400_000).toISOString().slice(0, 10); // ~12 semaines
    const { data } = await admin
      .from("weekly_employee_ratings")
      .select("rating, comment, week_monday")
      .eq("employee_id", employeeId)
      .gte("week_monday", since)
      .order("week_monday", { ascending: false });
    const rows = (data ?? []) as Array<{ rating: number; comment: string | null; week_monday: string }>;
    if (rows.length === 0) return { avg: null, weeks: 0, comments: [] };
    const avg = rows.reduce((a, r) => a + Number(r.rating || 0), 0) / rows.length;
    const comments = rows
      .map((r) => (r.comment ?? "").trim())
      .filter((c) => c.length > 0)
      .slice(0, 2);
    return { avg, weeks: rows.length, comments };
  } catch {
    return { avg: null, weeks: 0, comments: [] };
  }
}

// ---------------------------------------------------------------------------
// Gabarit HTML doré (cohérent avec welcome / onboarding-sheet).
// ---------------------------------------------------------------------------

const goldSection = (title: string, body: string) => `
        <tr><td style="padding:4px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7ef;border:1px solid #ecdfb8;border-radius:10px;margin:0 0 14px;">
            <tr><td style="padding:14px 18px;font-size:15px;line-height:1.6;color:#3a3a3a;">
              <p style="margin:0 0 6px;font-weight:700;color:#8a6d1f;">${title}</p>
              ${body}
            </td></tr>
          </table>
        </td></tr>`;

function shell(lang: "fr" | "nl", title: string, intro: string, sections: string, closingLead: string): string {
  const sig = "L'équipe Ressources Humaines — Caftan Factory Group";
  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">${title}</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">${intro}</p>
        </td></tr>
        ${sections}
        <tr><td style="padding:6px 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">${closingLead}</p>
          <p style="margin:0;color:#6b6b6b;">${sig}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

interface Copy {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// PHASE 1 — 4 variantes (J+7 → J+28).
// ---------------------------------------------------------------------------

// Rappel SUBTIL commun aux 4 mails (1ʳᵉ semaine = mise à niveau ; on compte
// maintenant sur tous ses talents pour un nouveau palier qu'on continue de mesurer).
const P1_NUDGE_FR =
  "Cette première semaine — que nous considérons comme une mise en jambes, le temps de trouver tes repères — est désormais derrière toi. Nous comptons maintenant sur <strong>tous tes talents</strong> pour atteindre ensemble un nouveau palier de performance : un cap que nous continuerons de mesurer, non pour te juger, mais pour t'accompagner au plus près tout au long de ton parcours.";
const P1_NUDGE_NL =
  "Deze eerste week — die wij zien als een inloopperiode, de tijd om je draai te vinden — ligt nu achter je. We rekenen vanaf nu op <strong>al je talenten</strong> om samen een nieuw prestatieniveau te bereiken: een niveau dat we blijven meten, niet om je te beoordelen, maar om je zo goed mogelijk te begeleiden gedurende je hele traject.";
const P1_NUDGE_FR_TXT =
  "Cette première semaine — que nous considérons comme une mise en jambes, le temps de trouver tes repères — est désormais derrière toi. Nous comptons maintenant sur tous tes talents pour atteindre ensemble un nouveau palier de performance : un cap que nous continuerons de mesurer, non pour te juger, mais pour t'accompagner au plus près tout au long de ton parcours.";
const P1_NUDGE_NL_TXT =
  "Deze eerste week — die wij zien als een inloopperiode, de tijd om je draai te vinden — ligt nu achter je. We rekenen vanaf nu op al je talenten om samen een nieuw prestatieniveau te bereiken: een niveau dat we blijven meten, niet om je te beoordelen, maar om je zo goed mogelijk te begeleiden gedurende je hele traject.";

type P1Key = "w1_day7" | "w1_day14" | "w1_day21" | "w1_day28";

interface P1Variant {
  fr: { subject: string; title: string; heading: string; body: string };
  nl: { subject: string; title: string; heading: string; body: string };
}

const P1: Record<P1Key, P1Variant> = {
  w1_day7: {
    fr: {
      subject: "Une première semaine réussie chez Caftan Factory 🌟",
      title: "Bravo pour ce premier cap 🌟",
      heading: "Tes premières contributions",
      body: "Déjà une semaine — et de belles premières contributions ! Nous tenions à te le dire : te voir prendre nos consignes au sérieux, et au premier degré comme nous l'aimons, nous fait sincèrement plaisir. Ton énergie pour t'intégrer et apprendre le métier ne passe pas inaperçue, et nous t'en remercions du fond du cœur.",
    },
    nl: {
      subject: "Een geslaagde eerste week bij Caftan Factory 🌟",
      title: "Proficiat met deze eerste stap 🌟",
      heading: "Je eerste bijdragen",
      body: "Al een week — en mooie eerste bijdragen! We wilden het je even zeggen: zien dat je onze richtlijnen serieus neemt, en letterlijk zoals wij het graag hebben, doet ons oprecht plezier. Je inzet om je in te werken en het vak te leren valt echt op, en daarvoor danken we je van harte.",
    },
  },
  w1_day14: {
    fr: {
      subject: "Deux semaines : ta montée en compétence 🌟",
      title: "Deux semaines, et ça monte 🌟",
      heading: "Ta progression",
      body: "Deux semaines déjà : tu prends tes marques et ta montée en compétence se voit clairement. Continue d'appliquer les consignes avec la même rigueur — c'est précisément ce que nous apprécions chez toi. Chaque geste que tu maîtrises aujourd'hui deviendra un vrai atout demain.",
    },
    nl: {
      subject: "Twee weken: je groei 🌟",
      title: "Twee weken, en het gaat vooruit 🌟",
      heading: "Je vooruitgang",
      body: "Al twee weken: je vindt je draai en je groei is duidelijk te zien. Blijf de richtlijnen met dezelfde nauwkeurigheid toepassen — dat is precies wat wij in jou waarderen. Elke handeling die je vandaag onder de knie krijgt, wordt morgen een echte troef.",
    },
  },
  w1_day21: {
    fr: {
      subject: "Trois semaines : le rythme est là 🌟",
      title: "Trois semaines : le rythme est là 🌟",
      heading: "Ton rythme de croisière",
      body: "Trois semaines : le rythme s'installe et tu gagnes en autonomie — bravo. Nous apprécions vraiment la façon dont tu tiens le cap et prends les consignes au sérieux. C'est le moment idéal pour viser un cran au-dessus : soin, vente, tenue du magasin — chaque détail que tu soignes fait la différence.",
    },
    nl: {
      subject: "Drie weken: het ritme zit erin 🌟",
      title: "Drie weken: het ritme zit erin 🌟",
      heading: "Je kruissnelheid",
      body: "Drie weken: het ritme zit erin en je wint aan zelfstandigheid — proficiat. We waarderen echt hoe je koers houdt en de richtlijnen serieus neemt. Dit is het ideale moment om een tandje bij te steken: verzorging, verkoop, orde in de winkel — elk detail dat je verzorgt, maakt het verschil.",
    },
  },
  w1_day28: {
    fr: {
      subject: "Bilan de ton premier mois chez Caftan Factory 🌟",
      title: "Un premier mois accompli 🌟",
      heading: "Le bilan de ton premier mois",
      body: "Un mois déjà ! Bravo pour ce premier chapitre : tu as trouvé tes repères, appliqué les consignes au premier degré et fourni de vrais efforts d'apprentissage. Ce premier mois pose des fondations solides sur lesquelles bâtir. À partir de maintenant, nous comptons sur toi pour transformer cet élan en une performance qui dure.",
    },
    nl: {
      subject: "Balans van je eerste maand bij Caftan Factory 🌟",
      title: "Een voltooide eerste maand 🌟",
      heading: "De balans van je eerste maand",
      body: "Al een maand! Proficiat met dit eerste hoofdstuk: je hebt je plek gevonden, de richtlijnen letterlijk toegepast en echte leerinspanningen geleverd. Deze eerste maand legt een stevige basis om op verder te bouwen. Vanaf nu rekenen we op jou om dit elan om te zetten in prestaties die standhouden.",
    },
  },
};

function buildPhase1Copy(lang: "fr" | "nl", prenom: string, milestone: string): Copy {
  const key = (["w1_day7", "w1_day14", "w1_day21", "w1_day28"] as P1Key[]).includes(milestone as P1Key)
    ? (milestone as P1Key)
    : "w1_day7";
  const v = P1[key][lang];
  const safePrenom = escapeHtml(prenom);
  const nudgeHtml = lang === "nl" ? P1_NUDGE_NL : P1_NUDGE_FR;
  const nudgeTxt = lang === "nl" ? P1_NUDGE_NL_TXT : P1_NUDGE_FR_TXT;

  if (lang === "nl") {
    const closing = "Blijf je vragen stellen aan je verantwoordelijke — we zijn er om je te doen slagen.";
    const html = shell(
      "nl",
      escapeHtml(v.title),
      `Hallo ${safePrenom}, ${escapeHtml(v.body)}`,
      goldSection(escapeHtml(v.heading), `<p style="margin:0;">${escapeHtml(v.body)}</p>`) +
        goldSection("Wat we van je verwachten", `<p style="margin:0;">${nudgeHtml}</p>`),
      closing,
    );
    const text =
      `Hallo ${prenom},\n\n` +
      `${v.body}\n\n` +
      `${nudgeTxt}\n\n` +
      `Blijf je vragen stellen aan je verantwoordelijke — we zijn er om je te doen slagen.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    return { subject: v.subject, text, html };
  }

  const closing = "Continue à poser tes questions à ton responsable — nous sommes là pour te faire réussir.";
  const html = shell(
    "fr",
    escapeHtml(v.title),
    `Bonjour ${safePrenom}, ${escapeHtml(v.body)}`,
    goldSection(escapeHtml(v.heading), `<p style="margin:0;">${escapeHtml(v.body)}</p>`) +
      goldSection("Ce que nous attendons de toi", `<p style="margin:0;">${nudgeHtml}</p>`),
    closing,
  );
  const text =
    `Bonjour ${prenom},\n\n` +
    `${v.body}\n\n` +
    `${nudgeTxt}\n\n` +
    `Continue à poser tes questions à ton responsable — nous sommes là pour te faire réussir.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  return { subject: v.subject, text, html };
}

// ---------------------------------------------------------------------------
// PHASE 2 — travailleur expérimenté, cadence 10 jours, bloc personnalisé.
// ---------------------------------------------------------------------------

function buildPersoBlock(lang: "fr" | "nl", perso: Perso): { html: string; text: string } {
  const hasAvg = perso.avg != null && perso.weeks > 0;
  const hasComments = perso.comments.length > 0;

  if (!hasAvg && !hasComments) {
    // Fallback élégant : aucune donnée exploitable, on n'invente rien.
    if (lang === "nl") {
      return {
        html: `<p style="margin:0;">Je traject wordt van dichtbij en met zorg gevolgd. Elke situatie die je aanpakt en elke inspanning die je levert, telt mee in de erkenning van je werk.</p>`,
        text: "Je traject wordt van dichtbij en met zorg gevolgd. Elke situatie die je aanpakt en elke inspanning die je levert, telt mee in de erkenning van je werk.",
      };
    }
    return {
      html: `<p style="margin:0;">Ton parcours est suivi de près, avec bienveillance. Chaque situation que tu affrontes et chaque effort que tu fournis comptent dans la reconnaissance de ton travail.</p>`,
      text: "Ton parcours est suivi de près, avec bienveillance. Chaque situation que tu affrontes et chaque effort que tu fournis comptent dans la reconnaissance de ton travail.",
    };
  }

  const avgStr = hasAvg ? (perso.avg as number).toFixed(1) : null;
  const commentsFr = perso.comments.map((c) => escapeHtml(c));
  const commentsNl = commentsFr;

  if (lang === "nl") {
    const parts: string[] = [];
    const partsTxt: string[] = [];
    if (avgStr) {
      parts.push(
        `<p style="margin:0 0 8px;">Op basis van je recente wekelijkse evaluaties (gemiddeld <strong>${avgStr}/5</strong> over ${perso.weeks} week${perso.weeks > 1 ? "en" : ""}) volgen we je traject van dichtbij.</p>`,
      );
      partsTxt.push(
        `Op basis van je recente wekelijkse evaluaties (gemiddeld ${avgStr}/5 over ${perso.weeks} week${perso.weeks > 1 ? "en" : ""}) volgen we je traject van dichtbij.`,
      );
    }
    if (hasComments) {
      parts.push(
        `<p style="margin:0;">Recent genoteerd: ${commentsNl.map((c) => `« ${c} »`).join("; ")}. We rekenen erop dat je op dit niveau blijft — of hoger.</p>`,
      );
      partsTxt.push(
        `Recent genoteerd: ${perso.comments.map((c) => `« ${c} »`).join("; ")}. We rekenen erop dat je op dit niveau blijft — of hoger.`,
      );
    }
    return { html: parts.join(""), text: partsTxt.join(" ") };
  }

  const parts: string[] = [];
  const partsTxt: string[] = [];
  if (avgStr) {
    parts.push(
      `<p style="margin:0 0 8px;">Au vu de tes évaluations hebdomadaires récentes (moyenne <strong>${avgStr}/5</strong> sur ${perso.weeks} semaine${perso.weeks > 1 ? "s" : ""}), nous suivons ton parcours de près.</p>`,
    );
    partsTxt.push(
      `Au vu de tes évaluations hebdomadaires récentes (moyenne ${avgStr}/5 sur ${perso.weeks} semaine${perso.weeks > 1 ? "s" : ""}), nous suivons ton parcours de près.`,
    );
  }
  if (hasComments) {
    parts.push(
      `<p style="margin:0;">Récemment noté : ${commentsFr.map((c) => `« ${c} »`).join(" ; ")}. Nous comptons sur toi pour te maintenir à ce niveau — voire au-dessus.</p>`,
    );
    partsTxt.push(
      `Récemment noté : ${perso.comments.map((c) => `« ${c} »`).join(" ; ")}. Nous comptons sur toi pour te maintenir à ce niveau — voire au-dessus.`,
    );
  }
  return { html: parts.join(""), text: partsTxt.join(" ") };
}

function buildPhase2Copy(lang: "fr" | "nl", prenom: string, perso: Perso): Copy {
  const safePrenom = escapeHtml(prenom);
  const persoBlock = buildPersoBlock(lang, perso);

  if (lang === "nl") {
    const subject = "Je traject bij Caftan Factory — samen hoog blijven mikken";
    const intro = `Hallo ${safePrenom}, je maakt intussen deel uit van het team en je ervaring groeit dag na dag.`;
    const demand =
      "Nu je een ervaren teamlid bent, stijgen onze interne eisen als vanzelf mee met jouw niveau — beschouw dat als een blijk van vertrouwen. Idealiter blijft dat niveau niet ter plaatse trappelen en zakt het zeker niet, maar groeit het verder. We rekenen op je om de lat hoog te houden — voor jezelf én voor het team.";
    const html = shell(
      "nl",
      "Samen hoog blijven mikken 🌟",
      intro,
      goldSection("Onze eisen = jouw niveau", `<p style="margin:0;">${demand}</p>`) +
        goldSection("Jouw persoonlijke opvolging", persoBlock.html),
      "Heb je een vraag of een idee? Bespreek het gerust met je verantwoordelijke.",
    );
    const text =
      `Hallo ${prenom},\n\n` +
      `${demand}\n\n` +
      `${persoBlock.text}\n\n` +
      `Heb je een vraag of een idee? Bespreek het gerust met je verantwoordelijke.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    return { subject, text, html };
  }

  const subject = "Ton parcours chez Caftan Factory — continuer à viser haut";
  const intro = `Bonjour ${safePrenom}, tu fais désormais pleinement partie de l'équipe et ton expérience s'affirme jour après jour.`;
  const demand =
    "En collaborateur désormais expérimenté, nous veillons à ce que nos exigences internes soient à la hauteur de ton niveau — vois-y une marque de confiance. Ce niveau, idéalement, ne stagne pas et ne décroît jamais : il continue de grandir. Nous comptons sur toi pour garder la barre haute — pour toi autant que pour l'équipe.";
  const html = shell(
    "fr",
    "Continuer à viser haut 🌟",
    intro,
    goldSection("Nos exigences = ton niveau", `<p style="margin:0;">${demand}</p>`) +
      goldSection("Ton suivi personnalisé", persoBlock.html),
    "Une question, une idée ? Parles-en librement à ton responsable.",
  );
  const text =
    `Bonjour ${prenom},\n\n` +
    `${demand}\n\n` +
    `${persoBlock.text}\n\n` +
    `Une question, une idée ? Parles-en librement à ton responsable.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// A. CADENCE RENOUVELLEMENT (2ᵉ contrat et +).
// Série ancrée sur le DÉBUT du contrat renouvelé le plus récent, AVANT la Phase 2.
//   rnw_welcome (J0) → rnw_5_1/2/3 (J+5/10/15) → rnw_8_1/2/3 (J+23/31/39).
// Ton : ravis du retour ; rappel SYNTHÉTIQUE des essentiels (ponctualité &
// présentation = base ; PRIORITÉ N°1 la vente ; procédures via le responsable ;
// calme ; esprit d'équipe adapté) ; DÉSAMORCER la routine du 2ᵉ contrat (« une
// confiance renouvelée, jamais un acquis ») en flattant le profil ; maintenir l'élan.
// ---------------------------------------------------------------------------

export const RENEWAL_MILESTONES: Array<{ milestone: string; day: number }> = [
  { milestone: "rnw_welcome", day: 0 },
  { milestone: "rnw_5_1", day: 5 },
  { milestone: "rnw_5_2", day: 10 },
  { milestone: "rnw_5_3", day: 15 },
  { milestone: "rnw_8_1", day: 23 },
  { milestone: "rnw_8_2", day: 31 },
  { milestone: "rnw_8_3", day: 39 },
];

/** Jours (depuis l'ancre renouvellement) d'un palier renouvellement, ou null. */
export function renewalMilestoneDay(milestone: string): number | null {
  const m = RENEWAL_MILESTONES.find((x) => x.milestone === milestone);
  return m ? m.day : null;
}

/**
 * Paliers renouvellement théoriquement dus à `daysSinceRenewal` jours depuis
 * l'ancre (début du contrat renouvelé), du PLUS RÉCENT au plus ancien. Le cron
 * enverra le premier non encore envoyé (rattrapage), un seul par run.
 */
export function dueRenewalMilestonesDesc(
  daysSinceRenewal: number,
): Array<{ milestone: string; phase: Phase; day: number }> {
  if (!Number.isFinite(daysSinceRenewal) || daysSinceRenewal < 0) return [];
  return RENEWAL_MILESTONES.filter((m) => daysSinceRenewal >= m.day)
    .slice()
    .sort((a, b) => b.day - a.day)
    .map((m) => ({ milestone: m.milestone, phase: "renewal" as Phase, day: m.day }));
}

// Rappel SYNTHÉTIQUE des essentiels (liste HTML + version texte), FR/NL.
const ESSENTIALS_FR: Array<[string, string]> = [
  ["Ponctualité & présentation", "la base non négociable : à l'heure, tenue soignée, sourire."],
  ["Priorité n°1 : la vente", "rayons complets et bien rangés, magasin impeccable — c'est ce qui fait vendre."],
  ["Les procédures", "échanges et remboursements passent toujours par le responsable."],
  ["Le calme", "quelle que soit la situation, on garde son sang-froid."],
  ["L'esprit d'équipe", "adapte-toi à l'équipe que tu rejoins et fais-la avancer avec toi."],
];
const ESSENTIALS_NL: Array<[string, string]> = [
  ["Stiptheid & voorkomen", "de niet-onderhandelbare basis: op tijd, verzorgd, met een glimlach."],
  ["Prioriteit nr. 1: verkoop", "volle en nette rekken, een onberispelijke winkel — dat doet verkopen."],
  ["De procedures", "ruilingen en terugbetalingen lopen altijd via de verantwoordelijke."],
  ["Rust bewaren", "in elke situatie behoud je je kalmte."],
  ["Teamgeest", "pas je aan het team aan waarbij je komt en trek het mee vooruit."],
];

function essentialsHtml(lang: "fr" | "nl"): string {
  const items = lang === "nl" ? ESSENTIALS_NL : ESSENTIALS_FR;
  return items
    .map(
      ([t, d]) =>
        `<p style="margin:0 0 6px;"><strong>${escapeHtml(t)}</strong> — ${escapeHtml(d)}</p>`,
    )
    .join("");
}
function essentialsTxt(lang: "fr" | "nl"): string {
  const items = lang === "nl" ? ESSENTIALS_NL : ESSENTIALS_FR;
  return items.map(([t, d]) => `- ${t} — ${d}`).join("\n");
}

function buildRenewalWelcomeCopy(lang: "fr" | "nl", prenom: string): Copy {
  const safePrenom = escapeHtml(prenom);
  if (lang === "nl") {
    const subject = "Wat fijn om je terug te zien bij Caftan Factory 🌟";
    const intro = `Hallo ${safePrenom}, wat een plezier om je opnieuw in het team te verwelkomen! Een nieuw contract is een nieuwe start… en je kent het huis al.`;
    const trust =
      "Een tweede contract is nooit een verworven recht: het is een <strong>hernieuwd vertrouwen</strong>, een mooie kans om al je potentieel te bevestigen. Je hebt getoond wat je waard bent — nu is het moment om nóg hoger te mikken.";
    const html = shell(
      "nl",
      "Welkom terug 🌟",
      intro,
      goldSection("De essentie, in één oogopslag", essentialsHtml("nl")) +
        goldSection("Een hernieuwd vertrouwen", `<p style="margin:0;">${trust}</p>`),
      "We geloven in je. Laten we er samen een topseizoen van maken.",
    );
    const text =
      `Hallo ${prenom},\n\n` +
      `Wat een plezier om je opnieuw in het team te verwelkomen! Een nieuw contract is een nieuwe start — en je kent het huis al.\n\n` +
      `De essentie, in één oogopslag:\n${essentialsTxt("nl")}\n\n` +
      `Een tweede contract is nooit een verworven recht: het is een hernieuwd vertrouwen, een mooie kans om al je potentieel te bevestigen. Nu is het moment om nóg hoger te mikken.\n\n` +
      `We geloven in je. Laten we er samen een topseizoen van maken.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    return { subject, text, html };
  }
  const subject = "Quel plaisir de te retrouver chez Caftan Factory 🌟";
  const intro = `Bonjour ${safePrenom}, quel plaisir de te compter à nouveau parmi nous ! Un nouveau contrat, c'est un nouveau départ… et tu connais déjà la maison.`;
  const trust =
    "Un second contrat n'est jamais un acquis : c'est une <strong>confiance qu'on te renouvelle</strong>, une belle occasion de confirmer tout ton potentiel. Tu as déjà montré ce que tu vaux — c'est le moment de viser encore plus haut.";
  const html = shell(
    "fr",
    "Bienvenue de retour 🌟",
    intro,
    goldSection("L'essentiel, en un coup d'œil", essentialsHtml("fr")) +
      goldSection("Une confiance renouvelée", `<p style="margin:0;">${trust}</p>`),
    "Nous croyons en toi. Faisons-en ensemble une très belle saison.",
  );
  const text =
    `Bonjour ${prenom},\n\n` +
    `Quel plaisir de te compter à nouveau parmi nous ! Un nouveau contrat, c'est un nouveau départ — et tu connais déjà la maison.\n\n` +
    `L'essentiel, en un coup d'œil :\n${essentialsTxt("fr")}\n\n` +
    `Un second contrat n'est jamais un acquis : c'est une confiance qu'on te renouvelle, une belle occasion de confirmer tout ton potentiel. C'est le moment de viser encore plus haut.\n\n` +
    `Nous croyons en toi. Faisons-en ensemble une très belle saison.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  return { subject, text, html };
}

// Les 6 messages de la série (5j puis 8j), chacun centré sur un axe différent,
// avec un fil rouge « confiance renouvelée / vise plus haut / maintiens l'élan ».
type RnwKey = "rnw_5_1" | "rnw_5_2" | "rnw_5_3" | "rnw_8_1" | "rnw_8_2" | "rnw_8_3";
interface RnwVariant {
  fr: { subject: string; title: string; heading: string; body: string; boost: string };
  nl: { subject: string; title: string; heading: string; body: string; boost: string };
}

const RENEWAL_SERIES: Record<RnwKey, RnwVariant> = {
  rnw_5_1: {
    fr: {
      subject: "Les fondamentaux, d'entrée de jeu 🌟",
      title: "On repart sur des bases solides 🌟",
      heading: "Ponctualité & présentation",
      body: "Tu connais la musique : tout commence par la ponctualité et une présentation impeccable. C'est la base qui inspire confiance au client dès le premier regard. Remets-la au cœur de chaque journée, elle donne le ton de tout le reste.",
      boost: "Tu as déjà prouvé que tu sais le faire — alors cette fois, montre-le avec encore plus d'assurance. Un contrat renouvelé, c'est une confiance qu'on te redonne : rends-la éclatante.",
    },
    nl: {
      subject: "De fundamenten, meteen vanaf dag één 🌟",
      title: "We vertrekken op een stevige basis 🌟",
      heading: "Stiptheid & voorkomen",
      body: "Je kent het liedje: alles begint met stiptheid en een onberispelijk voorkomen. Dat is de basis die de klant meteen vertrouwen geeft. Zet ze weer centraal in elke dag — ze bepaalt de toon voor de rest.",
      boost: "Je hebt al bewezen dat je het kan — laat het deze keer met nog meer overtuiging zien. Een hernieuwd contract is een hernieuwd vertrouwen: maak het schitterend.",
    },
  },
  rnw_5_2: {
    fr: {
      subject: "Priorité n°1 : la vente 🌟",
      title: "La vente avant tout 🌟",
      heading: "Rayons pleins, magasin impeccable",
      body: "Notre priorité numéro un reste la vente. Et la vente commence par un magasin impeccable : rayons complets, bien rangés, produits en valeur. Chaque article à sa place, c'est une vente qui se prépare toute seule.",
      boost: "Tu as l'expérience pour anticiper : sois celui ou celle qui repère le rayon à recharger avant qu'on te le demande. C'est exactement ce niveau d'initiative qu'on a voulu garder en te renouvelant.",
    },
    nl: {
      subject: "Prioriteit nr. 1: verkoop 🌟",
      title: "Verkoop vóór alles 🌟",
      heading: "Volle rekken, onberispelijke winkel",
      body: "Onze prioriteit nummer één blijft de verkoop. En verkoop begint bij een onberispelijke winkel: volle, nette rekken en producten die in de kijker staan. Elk artikel op zijn plaats is een verkoop die zichzelf voorbereidt.",
      boost: "Jij hebt de ervaring om te anticiperen: wees diegene die het bij te vullen rek opmerkt vóór men het je vraagt. Net dat initiatief wilden we behouden door je te verlengen.",
    },
  },
  rnw_5_3: {
    fr: {
      subject: "Les procédures & le calme 🌟",
      title: "Cadre et sang-froid 🌟",
      heading: "Procédures et maîtrise de soi",
      body: "Un rappel utile : les échanges et remboursements passent toujours par le responsable — c'est un cadre qui te protège autant qu'il protège le client. Et quelle que soit la situation, on garde son calme : c'est ce sang-froid qui fait la différence d'un vrai professionnel.",
      boost: "Ta maturité est un atout que peu maîtrisent. Continue de l'incarner : c'est aussi pour cette solidité qu'on t'a fait à nouveau confiance.",
    },
    nl: {
      subject: "De procedures & de rust 🌟",
      title: "Kader en koelbloedigheid 🌟",
      heading: "Procedures en zelfbeheersing",
      body: "Een nuttige herinnering: ruilingen en terugbetalingen lopen altijd via de verantwoordelijke — een kader dat jou net zo goed beschermt als de klant. En wat er ook gebeurt, je bewaart je rust: die koelbloedigheid maakt het verschil van een echte professional.",
      boost: "Jouw maturiteit is een troef die weinigen beheersen. Blijf ze belichamen: ook voor die stevigheid hebben we je opnieuw vertrouwd.",
    },
  },
  rnw_8_1: {
    fr: {
      subject: "L'esprit d'équipe, ton multiplicateur 🌟",
      title: "Ensemble, on va plus loin 🌟",
      heading: "L'esprit d'équipe",
      body: "Un magasin qui tourne, c'est une équipe qui avance ensemble. Adapte-toi à celles et ceux qui t'entourent, partage ce que tu sais, tire le groupe vers le haut. Ton expérience fait de toi un repère pour les autres.",
      boost: "Rejoindre une équipe, ce n'est pas s'y fondre en silence : c'est y apporter ton énergie. On t'a renouvelé aussi pour ça — sois un moteur, pas un passager.",
    },
    nl: {
      subject: "Teamgeest, jouw versterker 🌟",
      title: "Samen geraken we verder 🌟",
      heading: "Teamgeest",
      body: "Een winkel die draait, is een team dat samen vooruitgaat. Pas je aan wie je omringt, deel wat je weet, til de groep naar een hoger niveau. Jouw ervaring maakt je tot een houvast voor de anderen.",
      boost: "Bij een team komen betekent niet stil opgaan in de groep: het betekent je energie meebrengen. Ook daarvoor hebben we je verlengd — wees een motor, geen passagier.",
    },
  },
  rnw_8_2: {
    fr: {
      subject: "Ne jamais s'installer dans la routine 🌟",
      title: "La confiance se confirme chaque jour 🌟",
      heading: "Au-delà de la routine",
      body: "Le piège d'un second contrat, c'est de croire que tout est acquis. Or rien ne l'est jamais : c'est justement maintenant que tu peux transformer l'essai et devenir une valeur sûre. Chaque journée bien menée renforce la confiance qu'on t'accorde.",
      boost: "On te sait capable de bien plus que « faire le job ». Vise l'excellence, pas le suffisant : c'est ce qui distingue ceux qu'on garde durablement.",
    },
    nl: {
      subject: "Nooit verzanden in routine 🌟",
      title: "Vertrouwen bevestig je elke dag 🌟",
      heading: "Voorbij de routine",
      body: "De valstrik van een tweede contract is denken dat alles verworven is. Niets is dat ooit: net nú kun je het waarmaken en een vaste waarde worden. Elke goed uitgevoerde dag versterkt het vertrouwen dat men je geeft.",
      boost: "We weten dat je tot veel meer in staat bent dan « de job doen ». Mik op uitmuntendheid, niet op voldoende: dat onderscheidt wie men blijvend houdt.",
    },
  },
  rnw_8_3: {
    fr: {
      subject: "Garde l'élan, tu es sur ta lancée 🌟",
      title: "Maintiens le cap et l'élan 🌟",
      heading: "Maintenir l'élan",
      body: "Voilà quelques semaines que ton nouveau contrat a repris, et tu as retrouvé tes marques. L'enjeu maintenant : maintenir l'élan, ne rien relâcher, garder cette énergie qui fait de toi un pilier du magasin. La régularité, jour après jour, est ta plus grande force.",
      boost: "Tu as tout pour être parmi les meilleurs — c'est une conviction, pas une formule. Continue à te dépasser : c'est comme ça qu'on construit une vraie carrière chez Caftan Factory.",
    },
    nl: {
      subject: "Hou het elan vast, je zit op je lancering 🌟",
      title: "Hou koers en elan vast 🌟",
      heading: "Het elan vasthouden",
      body: "Je nieuwe contract loopt intussen enkele weken en je hebt je draai teruggevonden. De inzet nu: het elan vasthouden, niets laten verslappen, die energie behouden die van jou een pijler van de winkel maakt. Regelmaat, dag na dag, is je grootste kracht.",
      boost: "Je hebt alles om bij de besten te horen — dat is een overtuiging, geen formule. Blijf jezelf overtreffen: zo bouw je een echte carrière uit bij Caftan Factory.",
    },
  },
};

function buildRenewalSeriesCopy(lang: "fr" | "nl", prenom: string, milestone: string): Copy {
  const key = (["rnw_5_1", "rnw_5_2", "rnw_5_3", "rnw_8_1", "rnw_8_2", "rnw_8_3"] as RnwKey[]).includes(
    milestone as RnwKey,
  )
    ? (milestone as RnwKey)
    : "rnw_5_1";
  const v = RENEWAL_SERIES[key][lang];
  const safePrenom = escapeHtml(prenom);

  if (lang === "nl") {
    const html = shell(
      "nl",
      escapeHtml(v.title),
      `Hallo ${safePrenom}, ${escapeHtml(v.body)}`,
      goldSection(escapeHtml(v.heading), `<p style="margin:0;">${escapeHtml(v.body)}</p>`) +
        goldSection("Mik hoger", `<p style="margin:0;">${escapeHtml(v.boost)}</p>`),
      "Een vraag of een idee? Je verantwoordelijke staat voor je klaar.",
    );
    const text =
      `Hallo ${prenom},\n\n` +
      `${v.body}\n\n` +
      `${v.boost}\n\n` +
      `Een vraag of een idee? Je verantwoordelijke staat voor je klaar.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    return { subject: v.subject, text, html };
  }

  const html = shell(
    "fr",
    escapeHtml(v.title),
    `Bonjour ${safePrenom}, ${escapeHtml(v.body)}`,
    goldSection(escapeHtml(v.heading), `<p style="margin:0;">${escapeHtml(v.body)}</p>`) +
      goldSection("Vise plus haut", `<p style="margin:0;">${escapeHtml(v.boost)}</p>`),
    "Une question, une idée ? Ton responsable est là pour toi.",
  );
  const text =
    `Bonjour ${prenom},\n\n` +
    `${v.body}\n\n` +
    `${v.boost}\n\n` +
    `Une question, une idée ? Ton responsable est là pour toi.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  return { subject: v.subject, text, html };
}

// ---------------------------------------------------------------------------
// B. RAPPEL FIN DE CONTRAT — ~15 jours avant le terme (chaque contrat CDD).
// Ton « en bon père de famille », empreinte psychologique POSITIVE quel que soit
// le niveau atteint : renouvellement possible MAIS dépend des besoins/paramètres
// de l'entreprise ; ne pas relâcher, laisser une belle empreinte (le RH rappelle
// EN PRIORITÉ les plus méritants) ; un ressenti négatif éventuel ne doit être que
// PASSAGER et servir de base pour l'avenir ; gratitude sincère, être heureux
// d'avoir contribué chez Caftan Factory.
// ---------------------------------------------------------------------------

function buildEndReminderCopy(lang: "fr" | "nl", prenom: string, daysLeft: number, contractNumber: number): Copy {
  const safePrenom = escapeHtml(prenom);
  const d = Math.max(1, Math.round(daysLeft));

  // Karim 2026-07-08 : la « suite possible » DOIT être cohérente avec le NUMÉRO du
  // contrat qui se termine. Fin du 1er = renouvellement espéré ; fin du 2e = un 3e
  // est exceptionnel et se mérite (bon père de famille, motivant, jamais décourageant) ;
  // fin du 3e+ = reconnaissance appuyée de la fidélité.
  const suite = (() => {
    if (lang === "nl") {
      if (contractNumber >= 3)
        return {
          html: "Je trouw aan Caftan Factory is uitzonderlijk en we waarderen ze enorm. Een nieuwe verlenging hangt af van de noden van het bedrijf, maar je plaats in ons collectieve geheugen is verworven.",
          text: "Je trouw is uitzonderlijk en we waarderen ze enorm. Een nieuwe verlenging hangt af van de noden van het bedrijf, maar je plaats in ons geheugen is verworven.",
        };
      if (contractNumber === 2)
        return {
          html: "Een derde contract is zeldzamer en moet verdiend worden — voorbehouden aan profielen met een voorbeeldige, constante betrouwbaarheid en prestaties. We zouden je met plezier opnieuw verwelkomen, maar dat hangt af van je niveau en de noden van het bedrijf. Wat er ook gebeurt: laat een sterke indruk na — dat is wat je bij voorrang in onze gedachten terugbrengt.",
          text: "Een derde contract is zeldzamer en moet verdiend worden (voorbeeldige, constante betrouwbaarheid en prestaties). We zouden je met plezier opnieuw verwelkomen, maar dat hangt af van je niveau en de noden van het bedrijf. Laat hoe dan ook een sterke indruk na.",
        };
      return {
        html: "We zouden de samenwerking met plezier verlengen. Of dat lukt, hangt vooral af van de noden en de parameters van het bedrijf op dat moment — geen belofte, maar wel een oprechte wens.",
        text: "We zouden de samenwerking met plezier verlengen. Of dat lukt, hangt vooral af van de noden en parameters van het bedrijf — geen belofte, maar wel een oprechte wens.",
      };
    }
    if (contractNumber >= 3)
      return {
        html: "Ta fidélité à Caftan Factory est exceptionnelle, et nous la valorisons énormément. Une nouvelle reconduction dépendra des besoins de l'entreprise, mais ta place dans notre mémoire collective, elle, est acquise.",
        text: "Ta fidélité est exceptionnelle et nous la valorisons énormément. Une nouvelle reconduction dépendra des besoins de l'entreprise, mais ta place dans notre mémoire est acquise.",
      };
    if (contractNumber === 2)
      return {
        html: "Un troisième contrat est plus rare et se mérite — il est réservé aux profils d'une fiabilité et d'une performance exemplaires et constantes. Nous adorerions te compter à nouveau, mais cela dépendra de ton niveau et des besoins de l'entreprise. Quoi qu'il advienne, laisse une empreinte forte — c'est ce qui te ramènera en priorité dans nos pensées.",
        text: "Un troisième contrat est plus rare et se mérite (fiabilité et performance exemplaires et constantes). Nous adorerions te compter à nouveau, mais cela dépendra de ton niveau et des besoins de l'entreprise. Quoi qu'il advienne, laisse une empreinte forte.",
      };
    return {
      html: "Nous serions ravis de renouveler la collaboration. Que ce soit possible dépendra surtout des besoins et des paramètres de l'entreprise à ce moment-là — ce n'est donc pas une promesse, mais c'est un souhait sincère.",
      text: "Nous serions ravis de renouveler la collaboration. Que ce soit possible dépendra surtout des besoins et des paramètres de l'entreprise à ce moment-là — pas une promesse, mais un souhait sincère.",
    };
  })();

  if (lang === "nl") {
    const subject = "Je contract loopt af — een belangrijk woord 🌿";
    const intro = `Hallo ${safePrenom}, over ongeveer <strong>${d} dagen</strong> loopt je huidige contract af. Maar eerst en vooral: bedankt voor alles wat je dag na dag bijdraagt — we wilden je hierover persoonlijk een woord schrijven.`;
    const html = shell(
      "nl",
      "Een woord bij het naderende einde 🌿",
      intro,
      goldSection(
        "Een mogelijke voortzetting",
        `<p style="margin:0;">${suite.html}</p>`,
      ) +
        goldSection(
          "Laat een mooie indruk na",
          `<p style="margin:0;">Laat je prestaties nu vooral niet zakken — integendeel. Laat een mooie indruk na in het collectieve geheugen: wanneer er opnieuw een behoefte is, denken we in de eerste plaats aan de meest verdienstelijke medewerkers.</p>`,
        ) +
        goldSection(
          "En als er twijfel opkomt",
          `<p style="margin:0;">We begrijpen dat een minder goed gevoel soms de kop opsteekt. Laat het iets voorbijgaands zijn en maak er een verworven les van, zodat een gelijkaardige situatie zich in de toekomst niet herhaalt.</p>`,
        ),
      "Van harte dank voor alles wat je bij Caftan Factory hebt bijgedragen. We hopen dat je met een goed gevoel terugkijkt op deze periode.",
    );
    const text =
      `Hallo ${prenom},\n\n` +
      `Over ongeveer ${d} dagen loopt je huidige contract af. Maar eerst en vooral: bedankt voor alles wat je dag na dag bijdraagt — we wilden je hierover persoonlijk een woord schrijven.\n\n` +
      `${suite.text}\n\n` +
      `Laat je prestaties nu vooral niet zakken — integendeel. Laat een mooie indruk na: bij een nieuwe behoefte denken we in de eerste plaats aan de meest verdienstelijke medewerkers.\n\n` +
      `Mocht er een minder goed gevoel opkomen: laat het iets voorbijgaands zijn en maak er een verworven les van.\n\n` +
      `Van harte dank voor alles wat je hebt bijgedragen. We hopen dat je met een goed gevoel terugkijkt op deze periode.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    return { subject, text, html };
  }

  const subject = "Ton contrat arrive à son terme — un mot important 🌿";
  const intro = `Bonjour ${safePrenom}, dans environ <strong>${d} jours</strong>, ton contrat actuel arrivera à son terme. Avant toute chose, merci pour tout ce que tu apportes jour après jour — nous tenions à t'écrire un mot personnel à ce sujet.`;
  const html = shell(
    "fr",
    "Un mot à l'approche du terme 🌿",
    intro,
    goldSection(
      "Une suite possible",
      `<p style="margin:0;">${suite.html}</p>`,
    ) +
      goldSection(
        "Laisse une belle empreinte",
        `<p style="margin:0;">Surtout, ne baisse pas en performance — au contraire. Laisse une belle empreinte dans la mémoire collective : lorsqu'un besoin se représente, nous rappelons en priorité les collaborateurs les plus méritants.</p>`,
      ) +
      goldSection(
        "Et si un doute survient",
        `<p style="margin:0;">Nous comprenons qu'un sentiment négatif puisse parfois survenir. Qu'il ne soit que passager, et qu'il serve de base acquise pour éviter qu'une situation similaire ne se reproduise à l'avenir.</p>`,
      ),
    "Merci du fond du cœur pour tout ce que tu as apporté chez Caftan Factory. Nous espérons que tu gardes de cette période le souvenir heureux d'y avoir contribué.",
  );
  const text =
    `Bonjour ${prenom},\n\n` +
    `Dans environ ${d} jours, ton contrat actuel arrivera à son terme. Avant toute chose, merci pour tout ce que tu apportes jour après jour — nous tenions à t'écrire un mot personnel à ce sujet.\n\n` +
    `${suite.text}\n\n` +
    `Surtout, ne baisse pas en performance — au contraire. Laisse une belle empreinte : lorsqu'un besoin se représente, nous rappelons en priorité les collaborateurs les plus méritants.\n\n` +
    `Si un sentiment négatif survient, qu'il ne soit que passager et serve de base acquise pour l'avenir.\n\n` +
    `Merci du fond du cœur pour tout ce que tu as apporté. Nous espérons que tu gardes de cette période le souvenir heureux d'y avoir contribué.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Envoi (best-effort). Anti-doublon strict via worker_followups.
// ---------------------------------------------------------------------------

/**
 * Envoie (une seule fois) au travailleur le mail d'accompagnement du palier donné.
 *
 * @param milestone ex. 'w1_day7' (Phase 1) ou 'p2_day38' (Phase 2).
 * @param phase 'p1' | 'p2' (pilote le ton + la personnalisation).
 *
 * Best-effort : ne throw jamais. L'anti-doublon repose sur la table
 * worker_followups (unique (employee_id, milestone)) : ré-entrant.
 */
interface Contact {
  email: string;
  fullName: string | null;
  lang: "fr" | "nl";
  prenom: string;
}

/** Fiche travailleur (email + nom + langue). null si introuvable ou sans email. */
async function loadContact(admin: SupabaseClient, employeeId: string): Promise<Contact | null> {
  const { data: empRow } = await admin
    .from("employees")
    .select("id, email, full_name, preferred_language")
    .eq("id", employeeId)
    .maybeSingle();
  const emp = empRow as {
    id: string;
    email: string | null;
    full_name: string | null;
    preferred_language: string | null;
  } | null;
  if (!emp || !emp.email) return null;
  const lang = pickLang(emp.preferred_language);
  const prenom = firstNameOf(emp.full_name) || (lang === "nl" ? "collega" : "à toi");
  return { email: emp.email, fullName: emp.full_name, lang, prenom };
}

/** ANTI-DOUBLON : ce palier a-t-il déjà été envoyé pour ce travailleur ? */
async function isAlreadySent(admin: SupabaseClient, employeeId: string, milestone: string): Promise<boolean> {
  const { data } = await admin
    .from("worker_followups")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("milestone", milestone)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Envoi + trace (best-effort). Source en liste blanche du kill-switch.
 * La trace (unique (employee_id, milestone)) garantit l'anti-doublon même en course.
 */
async function deliverFollowup(
  admin: SupabaseClient,
  employeeId: string,
  milestone: string,
  phase: Phase,
  copy: Copy,
  fullName: string | null,
  to: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { sendAppMail } = await import("@/lib/app-mail");
  const res = await sendAppMail({
    to,
    toName: fullName ?? undefined,
    subject: copy.subject,
    body: copy.text,
    htmlBody: copy.html,
    bccHr: true,
    automated: true,
    source: SOURCE,
    employeeId,
  });
  if (!res.ok) return { sent: false, reason: res.error };
  await admin
    .from("worker_followups")
    .upsert(
      { employee_id: employeeId, milestone, phase },
      { onConflict: "employee_id,milestone", ignoreDuplicates: true },
    );
  return { sent: true };
}

export async function sendWorkerFollowup(
  admin: SupabaseClient,
  employeeId: string,
  milestone: string,
  phase: Phase,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const c = await loadContact(admin, employeeId);
    if (!c) return { sent: false, reason: "pas d'email travailleur" };
    if (await isAlreadySent(admin, employeeId, milestone)) {
      return { sent: false, reason: "déjà envoyé (anti-doublon)" };
    }
    let copy: Copy;
    if (phase === "p2") {
      const perso = await loadPerso(admin, employeeId);
      copy = buildPhase2Copy(c.lang, c.prenom, perso);
    } else {
      copy = buildPhase1Copy(c.lang, c.prenom, milestone);
    }
    return await deliverFollowup(admin, employeeId, milestone, phase, copy, c.fullName, c.email);
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

/**
 * A. Envoie (une seule fois) le palier de la cadence RENOUVELLEMENT.
 * milestone ∈ {rnw_welcome, rnw_5_1/2/3, rnw_8_1/2/3}. Anti-doublon strict.
 */
export async function sendRenewalFollowup(
  admin: SupabaseClient,
  employeeId: string,
  milestone: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const c = await loadContact(admin, employeeId);
    if (!c) return { sent: false, reason: "pas d'email travailleur" };
    if (await isAlreadySent(admin, employeeId, milestone)) {
      return { sent: false, reason: "déjà envoyé (anti-doublon)" };
    }
    const copy =
      milestone === "rnw_welcome"
        ? buildRenewalWelcomeCopy(c.lang, c.prenom)
        : buildRenewalSeriesCopy(c.lang, c.prenom, milestone);
    return await deliverFollowup(admin, employeeId, milestone, "renewal", copy, c.fullName, c.email);
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

/**
 * B. Envoie (une seule fois par contrat) le rappel FIN DE CONTRAT ~15 j avant le
 * terme. milestone = `end_reminder_<contractId>`. Anti-doublon par contrat.
 */
export async function sendEndReminder(
  admin: SupabaseClient,
  employeeId: string,
  contractId: string,
  daysLeft: number,
  contractNumber: number,
): Promise<{ sent: boolean; reason?: string }> {
  const milestone = `end_reminder_${contractId}`;
  try {
    const c = await loadContact(admin, employeeId);
    if (!c) return { sent: false, reason: "pas d'email travailleur" };
    if (await isAlreadySent(admin, employeeId, milestone)) {
      return { sent: false, reason: "déjà envoyé (anti-doublon)" };
    }
    const copy = buildEndReminderCopy(c.lang, c.prenom, daysLeft, contractNumber);
    return await deliverFollowup(admin, employeeId, milestone, "end", copy, c.fullName, c.email);
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Calcul du palier DÛ (le plus récent non encore couvert), à partir des jours
// écoulés depuis le début du contrat. Utilisé par le cron.
// ---------------------------------------------------------------------------

/**
 * À partir du nombre de jours depuis le début du contrat, renvoie le palier
 * (milestone + phase) le PLUS RÉCENT théoriquement dû, ou null si aucun.
 *   - Phase 1 : days ∈ [7,28] -> plus grand multiple de 7 (7/14/21/28).
 *   - Phase 2 : days ≥ 38     -> 38 + 10*floor((days-38)/10) (38/48/58…).
 * L'anti-doublon (table) décide ensuite s'il faut réellement l'envoyer.
 */
export function dueMilestone(days: number): { milestone: string; phase: Phase } | null {
  if (!Number.isFinite(days)) return null;
  if (days > 28) {
    if (days < 38) return null; // creux J+29 → J+37 (avant la 1ʳᵉ échéance Phase 2)
    const step = 38 + 10 * Math.floor((days - 38) / 10);
    return { milestone: `p2_day${step}`, phase: "p2" };
  }
  if (days >= 7) {
    const step = Math.min(28, 7 * Math.floor(days / 7));
    return { milestone: `w1_day${step}`, phase: "p1" };
  }
  return null;
}

/**
 * Tous les paliers théoriquement dus à `days` jours, du PLUS RÉCENT au plus ancien.
 * Le cron enverra le premier de cette liste qui n'a PAS encore été envoyé
 * (rattrapage : « le plus récent palier dû non encore envoyé »), un seul par run.
 */
export function dueMilestonesDesc(days: number): Array<{ milestone: string; phase: Phase }> {
  if (!Number.isFinite(days) || days < 7) return [];
  const out: Array<{ milestone: string; phase: Phase }> = [];
  if (days > 28) {
    // Phase 2 : 38, 48, 58… ≤ days, décroissant.
    if (days >= 38) {
      for (let d = 38 + 10 * Math.floor((days - 38) / 10); d >= 38; d -= 10) {
        out.push({ milestone: `p2_day${d}`, phase: "p2" });
      }
    }
    // Puis les paliers Phase 1 (rattrapage si jamais un run a été sauté avant J+28).
    for (let d = 28; d >= 7; d -= 7) out.push({ milestone: `w1_day${d}`, phase: "p1" });
    return out;
  }
  // days ∈ [7,28] : multiples de 7 ≤ days, décroissant.
  for (let d = Math.min(28, 7 * Math.floor(days / 7)); d >= 7; d -= 7) {
    out.push({ milestone: `w1_day${d}`, phase: "p1" });
  }
  return out;
}

export function todayISO(): string {
  return todayISOInBrussels();
}

// ---------------------------------------------------------------------------
// Prévision du PROCHAIN palier d'accompagnement (pour l'affichage RH).
// ---------------------------------------------------------------------------

/** Jour du palier (J+n) à partir de son identifiant milestone, ou null. */
export function followupMilestoneDay(milestone: string): number | null {
  const p1 = /^w1_day(\d+)$/.exec(milestone);
  if (p1) return Number(p1[1]);
  const p2 = /^p2_day(\d+)$/.exec(milestone);
  if (p2) return Number(p2[1]);
  const rnw = renewalMilestoneDay(milestone);
  if (rnw != null) return rnw; // jours depuis l'ancre RENOUVELLEMENT
  return null;
}

/** Libellé FR lisible d'un palier, ex. « J+14 (1ᵉ mois) » / « J+38 (suivi régulier) ». */
export function followupMilestoneLabel(milestone: string): string {
  if (milestone === "rnw_welcome") return "J+0 (retour — bienvenue)";
  if (milestone.startsWith("rnw_")) {
    const d = renewalMilestoneDay(milestone);
    return d != null ? `J+${d} (renouvellement)` : milestone;
  }
  if (milestone.startsWith("end_reminder_")) return "J-15 (fin de contrat)";
  const day = followupMilestoneDay(milestone);
  if (day == null) return milestone;
  if (milestone.startsWith("w1_")) return `J+${day} (1ᵉ mois)`;
  return `J+${day} (suivi régulier)`;
}

export interface FollowupSchedule {
  milestone: string;
  phase: Phase;
  /** Jour du palier (J+day). */
  day: number;
  /** Date d'envoi prévue "YYYY-MM-DD" = start_date + day jours. */
  dueDateISO: string;
  /** true si l'échéance est déjà passée (envoi imminent au prochain run cron). */
  overdue: boolean;
}

/**
 * Prochain palier d'accompagnement PROGRAMMÉ (non encore envoyé) pour un
 * travailleur, à partir de sa date de début de contrat et des paliers déjà
 * envoyés (worker_followups.milestone). Séquence : 7/14/21/28, puis 38/48/58…
 *
 * Renvoie le PREMIER palier de la séquence dont le milestone n'a pas encore été
 * envoyé, avec sa date d'envoi prévue (start_date + jour). `overdue` indique une
 * échéance déjà passée (le cron l'enverra au prochain passage). null si pas de
 * date de début ou si tous les paliers de l'horizon sont déjà couverts.
 */
export function nextFollowupSchedule(
  startDateISO: string | null | undefined,
  sentMilestones: string[],
  opts?: { renewed?: boolean; renewalAnchorISO?: string | null },
): FollowupSchedule | null {
  const start = (startDateISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  const sent = new Set(sentMilestones);
  const today = todayISOInBrussels();

  // A. RENOUVELLEMENT : tant que la série n'est pas terminée, elle prime (ancre =
  // début du contrat renouvelé). Une fois terminée, la Phase 2 reprend (skip p1).
  const renewalAnchor = (opts?.renewalAnchorISO ?? "").slice(0, 10);
  const renewed = !!opts?.renewed && /^\d{4}-\d{2}-\d{2}$/.test(renewalAnchor);
  if (renewed) {
    const nextRnw = RENEWAL_MILESTONES.find((m) => !sent.has(m.milestone));
    if (nextRnw) {
      const dueDateISO = addDaysISO(renewalAnchor, nextRnw.day);
      return {
        milestone: nextRnw.milestone,
        phase: "renewal",
        day: nextRnw.day,
        dueDateISO,
        overdue: daysBetweenISO(dueDateISO, today) > 0,
      };
    }
  }

  const tenure = daysBetweenISO(start, today);
  const maxSentDay = sentMilestones.reduce((m, s) => {
    const d = followupMilestoneDay(s);
    return d != null && d > m ? d : m;
  }, 0);
  // Horizon large : au-delà de l'ancienneté actuelle et du dernier palier envoyé,
  // pour garantir qu'on trouve le prochain palier non couvert (Phase 2 illimitée).
  const horizon = Math.max(Number.isFinite(tenure) ? tenure : 0, maxSentDay) + 12;

  const seq: Array<{ milestone: string; phase: Phase; day: number }> = [];
  // Renouvelé : plus de Phase 1 (réservée au 1er contrat) — Phase 2 uniquement.
  if (!renewed) for (const d of [7, 14, 21, 28]) seq.push({ milestone: `w1_day${d}`, phase: "p1", day: d });
  for (let d = 38; d <= Math.max(38, horizon); d += 10) {
    seq.push({ milestone: `p2_day${d}`, phase: "p2", day: d });
  }

  const next = seq.find((p) => !sent.has(p.milestone));
  if (!next) return null;
  const dueDateISO = addDaysISO(start, next.day);
  return { ...next, dueDateISO, overdue: daysBetweenISO(dueDateISO, today) > 0 };
}
