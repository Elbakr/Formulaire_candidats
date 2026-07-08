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
export type Phase = "p1" | "p2";

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
  "Maintenant que cette première semaine — que nous considérons comme une mise à niveau ponctuelle — est derrière toi, nous comptons sur <strong>tous tes talents</strong> pour atteindre un nouveau palier de performance, que nous continuerons de mesurer tout au long de ton parcours.";
const P1_NUDGE_NL =
  "Nu deze eerste week — die wij als een eenmalige inwerkperiode beschouwen — achter de rug is, rekenen we op <strong>al je talenten</strong> om een nieuw prestatieniveau te bereiken, dat we gedurende je hele traject blijven meten.";
const P1_NUDGE_FR_TXT =
  "Maintenant que cette première semaine — que nous considérons comme une mise à niveau ponctuelle — est derrière toi, nous comptons sur tous tes talents pour atteindre un nouveau palier de performance, que nous continuerons de mesurer tout au long de ton parcours.";
const P1_NUDGE_NL_TXT =
  "Nu deze eerste week — die wij als een eenmalige inwerkperiode beschouwen — achter de rug is, rekenen we op al je talenten om een nieuw prestatieniveau te bereiken, dat we gedurende je hele traject blijven meten.";

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
      body: "Une semaine déjà — et de belles premières contributions ! Nous sommes ravis de voir que tu prends nos consignes au sérieux et, comme nous l'aimons, au premier degré. Ton énergie pour t'intégrer et apprendre le métier se remarque, et nous t'en remercions sincèrement.",
    },
    nl: {
      subject: "Een geslaagde eerste week bij Caftan Factory 🌟",
      title: "Proficiat met deze eerste stap 🌟",
      heading: "Je eerste bijdragen",
      body: "Al een week — en mooie eerste bijdragen! We zijn blij te zien dat je onze richtlijnen serieus neemt en, zoals wij het graag hebben, letterlijk. Je inzet om je in te werken en het vak te leren valt op, en daarvoor danken we je oprecht.",
    },
  },
  w1_day14: {
    fr: {
      subject: "Deux semaines : ta montée en compétence 🌟",
      title: "Deux semaines, et ça monte 🌟",
      heading: "Ta progression",
      body: "Deux semaines déjà : tu prends tes marques et ta montée en compétence est visible. Continue à appliquer les consignes avec la même rigueur — c'est exactement ce que nous apprécions. Chaque geste bien maîtrisé aujourd'hui est un atout pour la performance de demain.",
    },
    nl: {
      subject: "Twee weken: je groei 🌟",
      title: "Twee weken, en het gaat vooruit 🌟",
      heading: "Je vooruitgang",
      body: "Al twee weken: je vindt je draai en je groei is zichtbaar. Blijf de richtlijnen met dezelfde nauwkeurigheid toepassen — dat is precies wat wij waarderen. Elke handeling die je vandaag beheerst, is een troef voor de prestaties van morgen.",
    },
  },
  w1_day21: {
    fr: {
      subject: "Trois semaines : le rythme est là 🌟",
      title: "Trois semaines : le rythme est là 🌟",
      heading: "Ton rythme de croisière",
      body: "Trois semaines : le rythme s'installe et tu gagnes en autonomie. Nous sommes contents de la façon dont tu tiens le cap et prends les consignes au sérieux. C'est le bon moment pour viser un cran au-dessus : soin, vente, tenue du magasin — chaque détail compte.",
    },
    nl: {
      subject: "Drie weken: het ritme zit erin 🌟",
      title: "Drie weken: het ritme zit erin 🌟",
      heading: "Je kruissnelheid",
      body: "Drie weken: het ritme zit erin en je wint aan zelfstandigheid. We zijn tevreden over hoe je koers houdt en de richtlijnen serieus neemt. Dit is het juiste moment om een tandje bij te steken: verzorging, verkoop, orde in de winkel — elk detail telt.",
    },
  },
  w1_day28: {
    fr: {
      subject: "Bilan de ton premier mois chez Caftan Factory 🌟",
      title: "Un premier mois accompli 🌟",
      heading: "Le bilan de ton premier mois",
      body: "Un mois déjà ! Bravo pour ce premier chapitre : tu as pris tes repères, appliqué les consignes au premier degré et montré de vrais efforts d'apprentissage. Ce premier mois pose des fondations solides. À partir de maintenant, nous comptons sur toi pour transformer cet élan en performance durable.",
    },
    nl: {
      subject: "Balans van je eerste maand bij Caftan Factory 🌟",
      title: "Een voltooide eerste maand 🌟",
      heading: "De balans van je eerste maand",
      body: "Al een maand! Proficiat met dit eerste hoofdstuk: je hebt je plek gevonden, de richtlijnen letterlijk toegepast en echte leerinspanningen getoond. Deze eerste maand legt een stevige basis. Vanaf nu rekenen we op jou om dit elan om te zetten in duurzame prestaties.",
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
        html: `<p style="margin:0;">Je parcours wordt van dichtbij gevolgd. Elke situatie die je aanpakt en elke inspanning die je levert, telt mee in de waardering van je werk.</p>`,
        text: "Je parcours wordt van dichtbij gevolgd. Elke situatie die je aanpakt en elke inspanning die je levert, telt mee in de waardering van je werk.",
      };
    }
    return {
      html: `<p style="margin:0;">Ton parcours est suivi de près. Chaque situation que tu affrontes et chaque effort que tu fournis comptent dans l'appréciation de ton travail.</p>`,
      text: "Ton parcours est suivi de près. Chaque situation que tu affrontes et chaque effort que tu fournis comptent dans l'appréciation de ton travail.",
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
      "Als ervaren medewerker verwachten we dat onze interne eisen jouw prestatieniveau evenaren: dat niveau mag nooit stagneren en al zeker niet dalen. We tellen op je om de lat hoog te houden — voor jezelf en voor het team.";
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
    "En travailleur expérimenté, nous attendons que nos exigences internes égalent ton niveau de performance : ce niveau ne doit jamais stagner, et encore moins décroître. Nous comptons sur toi pour garder la barre haute — pour toi comme pour l'équipe.";
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
export async function sendWorkerFollowup(
  admin: SupabaseClient,
  employeeId: string,
  milestone: string,
  phase: Phase,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    // 1) Fiche employé : email + nom + langue.
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
    if (!emp) return { sent: false, reason: "employé introuvable" };
    if (!emp.email) return { sent: false, reason: "pas d'email travailleur" };

    // 2) ANTI-DOUBLON : ce palier déjà envoyé pour ce travailleur ?
    const { data: already } = await admin
      .from("worker_followups")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("milestone", milestone)
      .limit(1)
      .maybeSingle();
    if (already) return { sent: false, reason: "déjà envoyé (anti-doublon)" };

    // 3) Contenu FR/NL selon phase + palier (+ perso Phase 2 via notes hebdo).
    const lang = pickLang(emp.preferred_language);
    const prenom = firstNameOf(emp.full_name) || (lang === "nl" ? "collega" : "à toi");
    let copy: Copy;
    if (phase === "p2") {
      const perso = await loadPerso(admin, employeeId);
      copy = buildPhase2Copy(lang, prenom, perso);
    } else {
      copy = buildPhase1Copy(lang, prenom, milestone);
    }

    // 4) Envoi (best-effort) — automated + source en liste blanche du kill-switch.
    const { sendAppMail } = await import("@/lib/app-mail");
    const res = await sendAppMail({
      to: emp.email,
      toName: emp.full_name ?? undefined,
      subject: copy.subject,
      body: copy.text,
      htmlBody: copy.html,
      bccHr: true,
      automated: true,
      source: SOURCE,
      employeeId,
    });
    if (!res.ok) return { sent: false, reason: res.error };

    // 5) Trace le palier (unique = anti-doublon). onConflict ignoré (course).
    await admin
      .from("worker_followups")
      .upsert(
        { employee_id: employeeId, milestone, phase },
        { onConflict: "employee_id,milestone", ignoreDuplicates: true },
      );

    return { sent: true };
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
  return null;
}

/** Libellé FR lisible d'un palier, ex. « J+14 (1ᵉ mois) » / « J+38 (suivi régulier) ». */
export function followupMilestoneLabel(milestone: string): string {
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
): FollowupSchedule | null {
  const start = (startDateISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  const sent = new Set(sentMilestones);
  const today = todayISOInBrussels();
  const tenure = daysBetweenISO(start, today);
  const maxSentDay = sentMilestones.reduce((m, s) => {
    const d = followupMilestoneDay(s);
    return d != null && d > m ? d : m;
  }, 0);
  // Horizon large : au-delà de l'ancienneté actuelle et du dernier palier envoyé,
  // pour garantir qu'on trouve le prochain palier non couvert (Phase 2 illimitée).
  const horizon = Math.max(Number.isFinite(tenure) ? tenure : 0, maxSentDay) + 12;

  const seq: Array<{ milestone: string; phase: Phase; day: number }> = [];
  for (const d of [7, 14, 21, 28]) seq.push({ milestone: `w1_day${d}`, phase: "p1", day: d });
  for (let d = 38; d <= Math.max(38, horizon); d += 10) {
    seq.push({ milestone: `p2_day${d}`, phase: "p2", day: d });
  }

  const next = seq.find((p) => !sent.has(p.milestone));
  if (!next) return null;
  const dueDateISO = addDaysISO(start, next.day);
  return { ...next, dueDateISO, overdue: daysBetweenISO(dueDateISO, today) > 0 };
}
