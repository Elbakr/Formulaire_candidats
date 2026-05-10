// Scoring intelligent candidat (0-100) avec 8 sous-scores détaillés.
// Inspiré de l'ancien `calcScore` (recrutement.html section 1.6/1.7).
//
// Sous-scores (somme = 110 max → écrêté à 100) :
//   - profile_completeness  /20  — champs admin remplis
//   - motivation_quality    /15  — longueur + signaux qualité
//   - availability_fit      /15  — available_from + wanted_contract_type + jours dispo
//   - languages_fit         /15  — FR/AR/NL/EN avec niveaux
//   - cv_present            /10  — CV uploadé
//   - experience_age        /10  — proxy via âge (ne pas discriminer trop fort)
//   - urgency               /10  — bonus si récent, malus si vieux sans contact
//   - distance              /15  — proximité du magasin le plus proche
// 110 max sommé → écrêté à 100. La distance pèse ~15% effectif.
// Si la distance n'est pas fournie (postcode null) → score neutre 50% du max.

import { hasFRandAR, inferLangs, levelMeets } from "@/lib/heuristics/languages";
import { distanceToScore } from "@/lib/distance";

export type CandidateScored = {
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  city?: string | null;
  address?: string | null;
  postal_code?: string | null;
  nrn?: string | null;
  iban?: string | null;
  motivation?: string | null;
  available_from?: string | null;
  wanted_contract_type?: string | null;
  langs?: Record<string, string> | null;
  raw_payload?: Record<string, unknown> | null;
  applied_at?: string | null;
  created_at?: string | null;
  /** Pipeline status, used to detect "applied long ago, never contacted". */
  status?: string | null;
  /**
   * Distance (km) au magasin le plus proche. À précalculer côté serveur
   * via `distanceCandidateToSites(postcode, city)` puis injecter ici.
   * `null` si postcode inconnu / commune introuvable → score neutre 50%.
   */
  closest_site_distance_km?: number | null;
};

export type ScoreBreakdown = {
  profile: number;
  motivation: number;
  availability: number;
  languages: number;
  cv: number;
  experience: number;
  urgency: number;
  distance: number;
};

export type ScoreResult = {
  total: number;
  breakdown: ScoreBreakdown;
  recommendation: { label: string; tone: "good" | "ok" | "warn" | "bad"; detail: string };
};

const MAX = {
  profile: 20,
  motivation: 15,
  availability: 15,
  languages: 20,
  cv: 10,
  experience: 10,
  urgency: 10,
  distance: 12,
};

function calcAge(birth?: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function computeCandidateScoreDetailed(c: CandidateScored): ScoreResult {
  // 1. Profile completeness
  const fields: (keyof CandidateScored)[] = [
    "email", "phone", "birth_date", "city", "address", "postal_code", "nrn", "iban",
  ];
  const filled = fields.filter((f) => !!String(c[f] ?? "").trim()).length;
  const profile = Math.round((filled / fields.length) * MAX.profile);

  // 2. Motivation
  const motivLen = (c.motivation ?? "").trim().length;
  let motivation = 0;
  if (motivLen >= 200) motivation = MAX.motivation;
  else if (motivLen >= 100) motivation = 11;
  else if (motivLen >= 50) motivation = 7;
  else if (motivLen > 0) motivation = 3;

  // 3. Availability
  let availability = 0;
  if (c.available_from) availability += 6;
  if (c.wanted_contract_type) availability += 5;
  // Jours dispo dans raw_payload
  const raw = (c.raw_payload ?? {}) as Record<string, unknown>;
  const dispoJours = raw.dispo_jours ?? raw.jours_dispo ?? raw.availability_days ?? raw.days;
  if (Array.isArray(dispoJours) && dispoJours.length > 0) {
    availability += Math.min(4, dispoJours.length);
  } else if (typeof dispoJours === "string" && dispoJours.length > 0) {
    availability += 2;
  }
  availability = Math.min(MAX.availability, availability);

  // 4. Languages — utilise heuristique FR+AR par défaut si vide
  const langs = inferLangs({ langs: c.langs ?? null });
  let languages = 0;
  const keysLower = Object.keys(langs).map((k) => k.toLowerCase());
  const hasFR = keysLower.some((k) => k.startsWith("fra") || k === "fr");
  const hasAR = keysLower.some((k) => k.startsWith("ara") || k === "ar");
  const hasNL = keysLower.some((k) => k.startsWith("nee") || k.startsWith("néer") || k === "nl");
  const hasEN = keysLower.some((k) => k.startsWith("ang") || k.startsWith("eng") || k === "en");
  if (hasFR) languages += 7;
  if (hasAR) languages += 7;
  if (hasNL) languages += 4;
  if (hasEN) languages += 2;
  // Bonus niveau courant FR/AR
  for (const k of Object.keys(langs)) {
    const lk = k.toLowerCase();
    if ((lk.startsWith("fra") || lk.startsWith("ara")) && levelMeets(langs[k], "courant")) {
      languages += 1;
    }
  }
  languages = Math.min(MAX.languages, languages);

  // 5. CV
  const cvUrl = (raw.cv_url as string | undefined) ?? (raw.cv as string | undefined);
  const cv = cvUrl && String(cvUrl).trim() ? MAX.cv : 0;

  // 6. Experience proxy via âge
  const age = calcAge(c.birth_date);
  let experience = 0;
  if (age !== null) {
    if (age < 18) experience = 0; // mineur = blocant ailleurs, mais ici juste 0
    else if (age >= 22 && age <= 30) experience = MAX.experience;
    else if (age >= 18 && age < 22) experience = 7;
    else if (age > 30 && age <= 40) experience = 9;
    else if (age > 40 && age <= 50) experience = 7;
    else experience = 4;
  } else {
    experience = 5; // neutre si inconnu
  }

  // 7. Urgency : appliqué récemment = bonus ; appliqué il y a >30j sans contact = malus
  const appliedISO = c.applied_at ?? c.created_at ?? null;
  let urgency = 5; // neutre par défaut
  if (appliedISO) {
    const days = Math.floor((Date.now() - new Date(appliedISO).getTime()) / 86_400_000);
    if (days <= 3) urgency = MAX.urgency;
    else if (days <= 7) urgency = 8;
    else if (days <= 14) urgency = 6;
    else if (days <= 30) urgency = 4;
    else {
      // Vieux + jamais contacté → malus
      const stale = c.status === "new" || !c.status;
      urgency = stale ? 0 : 3;
    }
  }

  // 8. Distance — 0..MAX.distance selon le scoring linéaire piloté par paliers.
  // Si la distance n'a pas pu être calculée (postcode null / commune inconnue)
  // on injecte un score neutre 50% pour ne pas pénaliser le candidat.
  const distRaw = c.closest_site_distance_km;
  const distPct = distanceToScore(distRaw); // 0..100
  const distance = Math.round((distPct / 100) * MAX.distance);

  const breakdown: ScoreBreakdown = {
    profile,
    motivation,
    availability,
    languages,
    cv,
    experience,
    urgency,
    distance,
  };

  const total = Math.max(
    0,
    Math.min(
      100,
      profile + motivation + availability + languages + cv + experience + urgency + distance,
    ),
  );

  // Recommandation
  let rec: ScoreResult["recommendation"];
  const blockingFR_AR = !hasFRandAR(langs);
  if (total >= 75) {
    rec = { label: "Profil prometteur, à contacter rapidement", tone: "good", detail: "Score élevé sur la plupart des axes." };
  } else if (total >= 60) {
    rec = { label: "Bon profil — convoquer", tone: "good", detail: "Score solide, à convoquer en entretien." };
  } else if (total >= 45) {
    rec = { label: "Profil moyen, à examiner", tone: "ok", detail: "Quelques manques mais peut être convoqué après vérification." };
  } else if (total >= 30) {
    rec = { label: "À mettre en liste d'attente", tone: "warn", detail: "Profil incomplet, à reconsidérer si besoin." };
  } else {
    rec = { label: "Profil faible, à refuser poliment", tone: "bad", detail: "Score insuffisant sur plusieurs axes critiques." };
  }
  if (blockingFR_AR) {
    rec = { ...rec, detail: rec.detail + " ⚠ Pas de FR+AR détecté (souvent éliminatoire à Bruxelles)." };
  }

  return { total, breakdown, recommendation: rec };
}

/** Backwards-compat : retourne juste le total. */
export function computeCandidateScore(c: CandidateScored): number {
  return computeCandidateScoreDetailed(c).total;
}

export function scoreLabel(score: number): { label: string; cls: string } {
  if (score >= 75) return { label: "Très bon", cls: "bg-success-light text-success" };
  if (score >= 55) return { label: "Bon", cls: "bg-gold-light text-gold-dark" };
  if (score >= 35) return { label: "Moyen", cls: "bg-warn-light text-warn" };
  return { label: "Faible", cls: "bg-danger-light text-danger" };
}

/** Max value of each sub-score (utile pour les barres UI). */
export const SCORE_MAX = MAX;
