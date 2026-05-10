// Helpers pour les coefficients de rush horaire (AUTOPLAN_RULES).
//
// Le profil de rush est stocké dans `rush_profile_segments` :
//   * site_id = NULL → profil global par défaut
//   * day_of_week = NULL → applicable à tous les jours
//
// Convention de résolution :
//   1. Si le site a un profil dédié (site_id = X), on l'utilise.
//   2. Sinon on retombe sur le profil global (site_id IS NULL).
//   3. Au sein du jeu retenu, on filtre par day_of_week (== dow OR NULL).
//
// Le score d'un créneau est la SOMME des (chevauchement_minutes × weight)
// sur les segments qui matchent. Plus haut = pic. Le solver compare ce score
// à un seuil pour décider si le créneau mérite un employé senior.

import { createClient } from "@/lib/supabase/server";

export type RushSegment = {
  start_minute: number;
  end_minute: number;
  weight: number;
  /** Optionnel — pour debug / explicabilité. */
  label?: string | null;
};

type Row = {
  site_id: string | null;
  day_of_week: number | null;
  start_minute: number;
  end_minute: number;
  weight: number;
  label: string | null;
  is_active: boolean;
};

/**
 * Charge le profil de rush applicable pour un site donné.
 * - Si `siteId` non null et qu'il existe au moins 1 segment dédié → renvoie ces segments.
 * - Sinon, fallback sur les segments globaux (site_id IS NULL).
 *
 * Renvoie [] si rien n'est défini (le solver doit alors traiter tous les
 * créneaux comme "neutres" — comportement AVANT cette feature).
 */
export async function loadRushProfile(
  siteId: string | null,
): Promise<RushSegment[]> {
  const supabase = await createClient();

  // 1) Tente le profil dédié au site (s'il existe).
  if (siteId) {
    const { data: own } = await supabase
      .from("rush_profile_segments")
      .select("site_id, day_of_week, start_minute, end_minute, weight, label, is_active")
      .eq("is_active", true)
      .eq("site_id", siteId);
    const ownRows = (own ?? []) as Row[];
    if (ownRows.length > 0) {
      return ownRows.map(rowToSeg);
    }
  }

  // 2) Fallback global.
  const { data: global } = await supabase
    .from("rush_profile_segments")
    .select("site_id, day_of_week, start_minute, end_minute, weight, label, is_active")
    .eq("is_active", true)
    .is("site_id", null);
  const globalRows = (global ?? []) as Row[];
  return globalRows.map(rowToSeg);
}

function rowToSeg(r: Row): RushSegment {
  return {
    start_minute: r.start_minute,
    end_minute: r.end_minute,
    weight: Number(r.weight),
    label: r.label,
  };
}

/** Convertit "HH:MM" ou "HH:MM:SS" → minutes depuis 00:00. */
function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calcule le score de rush d'un créneau [slotStart, slotEnd] (chaînes "HH:MM").
 * Score = somme des (chevauchement_minutes × weight) sur les segments fournis.
 *
 * Exemple — créneau 13:00-19:00 avec le profil par défaut :
 *   13-15 (×1.5) → 120 × 1.5 = 180
 *   15-17 (×3.0) → 120 × 3.0 = 360
 *   17-18 (×2.0) →  60 × 2.0 = 120
 *   18-19 (×1.0) →  60 × 1.0 = 60
 *   Total = 720 points (très "pic" → senior recommandé).
 */
export function calcSlotRushScore(
  segments: RushSegment[],
  slotStartTime: string,
  slotEndTime: string,
): number {
  if (segments.length === 0) return 0;
  const s = timeToMin(slotStartTime);
  const e = timeToMin(slotEndTime);
  if (e <= s) return 0;
  let total = 0;
  for (const seg of segments) {
    const overlap = Math.max(0, Math.min(e, seg.end_minute) - Math.max(s, seg.start_minute));
    if (overlap > 0) total += overlap * seg.weight;
  }
  return total;
}

/**
 * Score moyen pondéré (par minute) — utile pour comparer 2 créneaux de durée
 * différente. Renvoie 0 si la fenêtre est nulle ou si pas de segments.
 */
export function calcSlotRushIntensity(
  segments: RushSegment[],
  slotStartTime: string,
  slotEndTime: string,
): number {
  const s = timeToMin(slotStartTime);
  const e = timeToMin(slotEndTime);
  if (e <= s) return 0;
  return calcSlotRushScore(segments, slotStartTime, slotEndTime) / (e - s);
}

/**
 * Seuil au-dessus duquel un créneau est considéré "pic" (et qu'on doit
 * privilégier un employé senior). Calé sur l'intensité moyenne 1.5
 * (= "montée critique" du profil par défaut), tout ce qui est >= 1.5 par
 * minute est un pic.
 *
 * Exposé en constante pour permettre un tuning futur sans toucher au solver.
 */
export const RUSH_INTENSITY_PEAK_THRESHOLD = 1.5;
