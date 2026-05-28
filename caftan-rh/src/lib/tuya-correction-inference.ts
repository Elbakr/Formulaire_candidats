// Karim 2026-05-26 : Service d inference statistique pour auto-correction
// des pointages anormaux.
//
// REGLE METIER (Karim) :
//   1. Detecter les events suspects (erreur de doigt, oubli, fausse manip)
//   2. Analyser l historique 15j de l employe pour deduire l action probable
//   3. Si confiance >= 85% -> auto-appliquer la correction
//   4. Si confiance < 85% -> laisser tel quel mais notifier RH
//   5. Apprendre des revisions RH passees pour ameliorer la precision
//
// L inference est basee sur :
//   - profil horaire historique (IN typique, OUT typique, ecart-type)
//   - frequence des shifts soir vs jour
//   - frequence des erreurs de doigt passees (events reclassifies par RH)
//   - coherence avec le shift planifie du jour

export type EmployeeProfile = {
  // Heure typique IN (mediane sur 15j, en heures decimales locales)
  typicalInHour: number;
  // Ecart-type des IN (variance horaire)
  inStdDev: number;
  // Heure typique OUT
  typicalOutHour: number;
  outStdDev: number;
  // % des jours-travailles avec un VRAI shift soir (IN >=16h + OUT apres)
  eveningShiftRatio: number;
  // Nb total jours travailles dans l historique
  totalDays: number;
  // Nb de revisions RH passees (corrections appliquees puis validees)
  hrApprovedCorrections: number;
  // Heure moyenne de duree de shift (en minutes)
  avgShiftMinutes: number;
};

export type RawEvent = {
  kind: "in" | "out";
  occurred_at: string; // ISO
  source: string | null;
};

export type InferenceResult = {
  // kind a appliquer (peut etre identique au kind original si pas d erreur)
  correctedKind: "in" | "out";
  // Si on doit ajouter un OUT virtuel : iso timestamp
  inferredOutAt: string | null;
  // Si on doit ajouter un IN virtuel
  inferredInAt: string | null;
  // 0-100, confiance dans la correction
  confidence: number;
  // Raison lisible
  reason: string;
  // True si l action a ete auto-appliquee (>= 85% confiance)
  autoApplied: boolean;
  // True si validation RH requise (toujours true pour audit)
  requiresHrReview: boolean;
};

const HOUR_MS = 3600_000;
const AUTO_APPLY_THRESHOLD = 85;
const LOCAL_OFFSET_MS = 2 * HOUR_MS; // UTC+2 BE summer

function localHour(iso: string): number {
  const d = new Date(new Date(iso).getTime() + LOCAL_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

function localDay(iso: string): string {
  return new Date(new Date(iso).getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

/**
 * Calcule le profil horaire d un employe a partir de son historique 15 jours.
 */
export function buildEmployeeProfile(events15d: RawEvent[]): EmployeeProfile {
  // Group par jour
  const byDay = new Map<string, RawEvent[]>();
  for (const e of events15d) {
    const d = localDay(e.occurred_at);
    const arr = byDay.get(d) ?? [];
    arr.push(e);
    byDay.set(d, arr);
  }
  const firstHours: number[] = [];
  const lastHours: number[] = [];
  const shiftDurations: number[] = [];
  let eveningCount = 0;
  let hrApproved = 0;
  for (const [, evs] of byDay) {
    const sorted = [...evs].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    if (sorted.length === 0) continue;
    firstHours.push(localHour(sorted[0].occurred_at));
    lastHours.push(localHour(sorted[sorted.length - 1].occurred_at));
    // Detecte vrai shift soir : IN >=16h + OUT apres
    const ins = sorted.filter((e) => e.kind === "in");
    const outs = sorted.filter((e) => e.kind === "out");
    for (let k = 0; k < Math.min(ins.length, outs.length); k++) {
      const inH = localHour(ins[k].occurred_at);
      const outTs = new Date(outs[k].occurred_at).getTime();
      const inTs = new Date(ins[k].occurred_at).getTime();
      if (outTs > inTs) shiftDurations.push((outTs - inTs) / 60_000);
      if (inH >= 16) eveningCount++;
    }
    // Compte les revisions RH (source = manual_admin)
    for (const e of sorted) {
      if (e.source === "manual_admin") hrApproved++;
    }
  }
  return {
    typicalInHour: median(firstHours),
    inStdDev: stdDev(firstHours),
    typicalOutHour: median(lastHours),
    outStdDev: stdDev(lastHours),
    eveningShiftRatio: byDay.size > 0 ? eveningCount / byDay.size : 0,
    totalDays: byDay.size,
    hrApprovedCorrections: hrApproved,
    avgShiftMinutes: shiftDurations.length > 0 ? Math.round(shiftDurations.reduce((a, b) => a + b, 0) / shiftDurations.length) : 480,
  };
}

/**
 * Detecte si un event entrant est probablement une erreur de doigt
 * (kind=IN mais devrait etre OUT, ou inverse) et propose une correction.
 *
 * @param event Event brut Tuya (kind inferre par alternance)
 * @param profile Profil 15j de l employe
 * @param sameDayEvents Events deja inseres pour cet employe le meme jour
 *                     (utile pour detecter pause = revenu apres OUT matin)
 */
export function inferKindCorrection(
  event: { kind: "in" | "out"; occurred_at: string },
  profile: EmployeeProfile,
  sameDayEvents: RawEvent[],
): InferenceResult {
  const eventHour = localHour(event.occurred_at);
  const originalKind = event.kind;

  // Cas 1 : IN tardif (>=16h) sans OUT apres dans la journee
  //   -> probablement erreur de doigt (devrait etre OUT)
  //   SAUF si l employe est evening worker (>=30% jours avec vrai shift soir)
  if (originalKind === "in" && eventHour >= 16) {
    const hasOutAfter = sameDayEvents.some(
      (e) => e.kind === "out" && new Date(e.occurred_at).getTime() > new Date(event.occurred_at).getTime(),
    );
    if (hasOutAfter) {
      return {
        correctedKind: "in",
        inferredOutAt: null,
        inferredInAt: null,
        confidence: 95,
        reason: "IN tardif avec OUT posterieur = shift soir confirme",
        autoApplied: true,
        requiresHrReview: false,
      };
    }
    // Pas de OUT apres : suspect
    const isEveningWorker = profile.eveningShiftRatio >= 0.3;
    if (isEveningWorker) {
      // Garde IN, c est probablement un vrai shift soir, OUT manquant
      return {
        correctedKind: "in",
        inferredOutAt: null,
        inferredInAt: null,
        confidence: 70,
        reason: `Evening worker (${Math.round(profile.eveningShiftRatio * 100)}% jours soir) - IN tardif probable, OUT a inferer plus tard`,
        autoApplied: false,
        requiresHrReview: true,
      };
    }
    // Pas evening worker : forte presomption erreur de doigt
    // Confiance basee sur la coherence avec le profil :
    //   - profil IN typique < 14h -> erreur tres probable
    //   - faible variance des IN historiques -> confiance accrue
    const typicalInOk = profile.typicalInHour < 14;
    const lowVariance = profile.inStdDev < 2;
    let confidence = 60;
    if (typicalInOk) confidence += 20;
    if (lowVariance) confidence += 10;
    if (profile.totalDays >= 5) confidence += 5; // historique fiable
    return {
      correctedKind: "out",
      inferredOutAt: null,
      inferredInAt: null,
      confidence,
      reason: `IN tardif (${eventHour.toFixed(1)}h) anormal vs profil IN habituel (${profile.typicalInHour.toFixed(1)}h ±${profile.inStdDev.toFixed(1)}h). Probable erreur de doigt -> reclasse OUT`,
      autoApplied: confidence >= AUTO_APPLY_THRESHOLD,
      requiresHrReview: true,
    };
  }

  // Cas 2 : OUT matinal (<=12h) sans IN avant dans la journee
  //   -> probable erreur de doigt (devrait etre IN)
  if (originalKind === "out" && eventHour <= 12) {
    const hasInBefore = sameDayEvents.some(
      (e) => e.kind === "in" && new Date(e.occurred_at).getTime() < new Date(event.occurred_at).getTime(),
    );
    if (hasInBefore) {
      // OUT apres IN matin -> probablement OUT pause dejeuner
      return {
        correctedKind: "out",
        inferredOutAt: null,
        inferredInAt: null,
        confidence: 90,
        reason: "OUT matin apres IN matin = pause dejeuner",
        autoApplied: true,
        requiresHrReview: false,
      };
    }
    // Pas de IN avant : probable erreur de doigt
    const typicalInOk = profile.typicalInHour <= 13;
    let confidence = 65;
    if (typicalInOk) confidence += 20;
    if (profile.inStdDev < 2) confidence += 10;
    if (profile.totalDays >= 5) confidence += 5;
    return {
      correctedKind: "in",
      inferredOutAt: null,
      inferredInAt: null,
      confidence,
      reason: `OUT matinal (${eventHour.toFixed(1)}h) sans IN avant. Profil IN habituel ${profile.typicalInHour.toFixed(1)}h. Probable erreur de doigt -> reclasse IN`,
      autoApplied: confidence >= AUTO_APPLY_THRESHOLD,
      requiresHrReview: true,
    };
  }

  // Cas 3 : event normal (IN matin ou OUT apres-midi)
  return {
    correctedKind: originalKind,
    inferredOutAt: null,
    inferredInAt: null,
    confidence: 100,
    reason: "Event coherent avec profil",
    autoApplied: true,
    requiresHrReview: false,
  };
}

/**
 * Pour un IN orphan (sans OUT le meme jour) plus de 24h apres, infere
 * l heure du OUT manquant a partir du profil OUT typique.
 */
export function inferMissingOut(
  inEvent: { occurred_at: string },
  profile: EmployeeProfile,
): { outAt: string; confidence: number; reason: string } {
  const inHour = localHour(inEvent.occurred_at);
  const day = localDay(inEvent.occurred_at);

  // Si profil OUT typique > IN et duree plausible (3-12h)
  const proposedOutHour = profile.typicalOutHour;
  const inferredDurationMin = (proposedOutHour - inHour) * 60;

  let confidence = 50;
  let reason = "Inference OUT par profil typique";

  if (inferredDurationMin >= 180 && inferredDurationMin <= 720) {
    confidence = 75;
    reason = `OUT inferre a ${proposedOutHour.toFixed(1)}h (mediane historique) - duree ${Math.round(inferredDurationMin / 60)}h coherente`;
    if (profile.outStdDev < 1) confidence += 10;
    if (profile.totalDays >= 5) confidence += 5;
  } else if (inferredDurationMin < 180) {
    // OUT typique avant IN -> probable shift soir, +avg duration
    const outTs = new Date(new Date(inEvent.occurred_at).getTime() + profile.avgShiftMinutes * 60_000);
    return {
      outAt: outTs.toISOString(),
      confidence: 60,
      reason: `Shift soir : OUT estime a IN + duree moyenne ${Math.round(profile.avgShiftMinutes / 60)}h`,
    };
  }

  const outIso = new Date(`${day}T${String(Math.floor(proposedOutHour)).padStart(2, "0")}:${String(Math.round((proposedOutHour % 1) * 60)).padStart(2, "0")}:00+02:00`).toISOString();
  return { outAt: outIso, confidence, reason };
}

export const AUTO_CORRECTION_NOTE_PREFIX = "[AUTO-CORRECTION]";

/**
 * Formate la note JSON pour clock_entries.notes (audit trail).
 */
export function formatCorrectionNote(result: InferenceResult): string {
  return `${AUTO_CORRECTION_NOTE_PREFIX} ${JSON.stringify({
    confidence: result.confidence,
    reason: result.reason,
    autoApplied: result.autoApplied,
    correctedKind: result.correctedKind,
    requiresHrReview: result.requiresHrReview,
    timestamp: new Date().toISOString(),
  })}`;
}
