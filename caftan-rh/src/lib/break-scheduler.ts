// Karim 2026-05-21 : planification des pauses repas pour les shifts d une
// meme journee. Regles :
//   1. Pause centree au milieu du shift (approximativement)
//   2. Pauses sequentielles par site : pas 2 employes du meme site en pause
//      au meme moment
//   3. Decalage entre sites (A=+0, B=+15min, D=+30min, E=+45min...) pour
//      eviter que tous les magasins aient leurs pauses simultanees
//
// Retourne pour chaque draft un objet { breakStart, breakEnd } en HH:MM. La
// duree de la pause = break_minutes du draft.

export type DraftLike = {
  employee_id: string;
  date: string;
  site_id: string | null;
  start_time: string; // "HH:MM:SS" ou "HH:MM"
  end_time: string;
  break_minutes: number;
};

export type BreakSlot = {
  breakStart: string; // HH:MM
  breakEnd: string; // HH:MM
};

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function overlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * Calcule les fenetres de pause pour une liste de drafts. Decoupage en
 * groupes (date, site_id), tri par start_time, calcul incremental.
 *
 * @param drafts        liste de drafts (ou shifts existants)
 * @param siteOffsets   map siteCode -> minutes d offset (A=0, B=15, D=30...)
 *                      pour decaler les pauses entre sites
 * @returns map draftKey -> BreakSlot. draftKey = `${employee_id}|${date}|${start_time}`
 */
export function scheduleBreaks(
  drafts: Array<DraftLike & { _key: string }>,
  siteOffsets: Map<string, number> = new Map(),
): Map<string, BreakSlot> {
  const result = new Map<string, BreakSlot>();

  // Groupage par (date, site_id)
  const groups = new Map<string, typeof drafts>();
  for (const d of drafts) {
    if (!d.site_id) continue;
    if ((d.break_minutes ?? 0) <= 0) continue;
    const k = `${d.date}|${d.site_id}`;
    const arr = groups.get(k) ?? [];
    arr.push(d);
    groups.set(k, arr);
  }

  for (const [, group] of groups) {
    // Tri par heure de debut
    group.sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    // Recolte les fenetres de pause deja prises sur ce site/jour (pour eviter overlap)
    const takenSlots: Array<{ s: number; e: number }> = [];

    for (const d of group) {
      const breakMin = d.break_minutes ?? 0;
      const startMin = toMin(d.start_time);
      const endMin = toMin(d.end_time);
      const productiveSpan = endMin - startMin - breakMin;
      if (productiveSpan < 60) continue; // shift trop court pour une pause

      // Pause "ideale" = centree au milieu du shift productif
      const midMin = startMin + Math.floor((endMin - startMin) / 2 - breakMin / 2);
      // Offset par site (pour eviter pauses simultanees inter-sites)
      const siteOffset = siteOffsets.get(d.site_id!) ?? 0;
      let candidate = midMin + siteOffset;

      // Borne dans le shift : pause doit etre apres au moins 1h de travail
      // et finir au moins 30 min avant fin
      const minBreakStart = startMin + 60;
      const maxBreakStart = endMin - breakMin - 30;
      if (maxBreakStart < minBreakStart) {
        // pas de marge pour une pause confortable, on saute (pas de pause planifiee)
        continue;
      }
      if (candidate < minBreakStart) candidate = minBreakStart;
      if (candidate > maxBreakStart) candidate = maxBreakStart;

      // Cherche un creneau non chevauchant avec les pauses deja prises
      let attempts = 0;
      while (attempts < 20) {
        const slot = { s: candidate, e: candidate + breakMin };
        const conflict = takenSlots.find((t) => overlap(slot.s, slot.e, t.s, t.e));
        if (!conflict) {
          takenSlots.push(slot);
          result.set(d._key, {
            breakStart: toHHMM(candidate),
            breakEnd: toHHMM(candidate + breakMin),
          });
          break;
        }
        // Decale apres la pause en conflit
        candidate = conflict.e;
        if (candidate > maxBreakStart) candidate = maxBreakStart;
        attempts += 1;
      }
    }
  }
  return result;
}

/**
 * Genere les offsets par site (A=0, B=15, D=30, E=45, etc.) pour distribuer
 * les fenetres de pause entre magasins. L offset est un multiple de 15 min,
 * base sur la position alphabetique du code site (A->0, B->15, C->30, D->45,
 * E->60, ...). Modulo 60 min pour eviter des offsets trop grands sur un
 * shift de 8h.
 */
export function buildSiteOffsets(
  sites: Array<{ id: string; code: string }>,
): Map<string, number> {
  const m = new Map<string, number>();
  const sorted = [...sites].sort((a, b) => a.code.localeCompare(b.code));
  sorted.forEach((s, idx) => {
    m.set(s.id, (idx * 15) % 60);
  });
  return m;
}
