import "server-only";

// Karim 2026-07-12 : SCORE de formation, aide à la décision de RENOUVELLEMENT.
// Agrège, dès le jour 1 et à chaque événement :
//  - motivation (réactivité, « hâte d'apprendre », taux de confirmation) ;
//  - profil de LECTURE (temps de lecture par module : ni trop vite = survol, ni nul) ;
//  - moyenne des EXAMENS (crescendo) ;
//  - COHÉRENCE temps-de-lecture ↔ résultat d'examen (l'indice puissant voulu par Karim) ;
//  - progression + ressenti (pouls) + bilan de sortie.
// Recommandation NON bloquante (décision humaine).

import type { SupabaseClient } from "@supabase/supabase-js";

export type ExamResultView = { module_seq: number; level: number | null; score: number; total: number; pct: number; taken_at: string };
export type PoulsView = { feeling: number | null; note: string | null; answered_at: string | null; asked_at: string };

export type TrainingScore = {
  hasEnrollment: boolean;
  status: string | null;
  currentSeq: number;
  total: number;
  progressionPct: number;
  motivation: number; // 0..100
  readingProfile: number; // 0..100
  examAvg: number; // 0..100
  coherence: number | null; // 0..100 (adéquation lecture/examens)
  overall: number; // 0..100
  recommendation: "favorable" | "mitige" | "vigilance" | "insuffisant_data";
  recommendationLabel: string;
  exams: ExamResultView[];
  pouls: PoulsView[];
  exit: {
    submitted_at: string | null;
    rating_training: number | null;
    rating_colleagues: number | null;
    rating_work: number | null;
    rating_salary: number | null;
    rating_schedule: number | null;
    free_text: string | null;
    available_again: boolean | null;
    wants_candidate: boolean | null;
  } | null;
  confirmedCount: number;
  eagerCount: number;
  medianReadingSec: number | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Mappe un temps de lecture médian (s) en score d'engagement 0..100.
 *  <8s = survol (bas), 25-240s = bonne lecture (haut), >12min = suspect (redescend). */
function readingScoreFromMedian(med: number | null): number {
  if (med == null) return 0;
  if (med < 8) return clamp((med / 8) * 40); // 0..40
  if (med <= 25) return clamp(40 + ((med - 8) / 17) * 40); // 40..80
  if (med <= 240) return clamp(80 + ((med - 25) / 215) * 20); // 80..100
  if (med <= 720) return 100;
  return clamp(100 - ((med - 720) / 720) * 30); // redescend si absurde
}

export async function computeTrainingScore(admin: SupabaseClient, employeeId: string): Promise<TrainingScore> {
  const empty: TrainingScore = {
    hasEnrollment: false, status: null, currentSeq: 0, total: 0, progressionPct: 0,
    motivation: 0, readingProfile: 0, examAvg: 0, coherence: null, overall: 0,
    recommendation: "insuffisant_data", recommendationLabel: "Formation non démarrée",
    exams: [], pouls: [], exit: null, confirmedCount: 0, eagerCount: 0, medianReadingSec: null,
  };

  const { data: enrRaw } = await admin
    .from("training_enrollments")
    .select("current_seq, status, started_on")
    .eq("employee_id", employeeId)
    .maybeSingle();
  const enr = enrRaw as { current_seq: number; status: string; started_on: string } | null;
  if (!enr) return empty;

  const { data: maxRow } = await admin.from("training_modules").select("seq").eq("is_active", true).order("seq", { ascending: false }).limit(1).maybeSingle();
  const total = (maxRow as { seq: number } | null)?.seq ?? 0;

  const { data: evRaw } = await admin
    .from("training_events")
    .select("module_seq, sent_at, confirmed_at, reading_seconds, action")
    .eq("employee_id", employeeId);
  const events = (evRaw ?? []) as Array<{ module_seq: number; sent_at: string | null; confirmed_at: string | null; reading_seconds: number | null; action: string | null }>;

  const sentCount = events.filter((e) => e.sent_at).length;
  const confirmed = events.filter((e) => e.confirmed_at);
  const confirmedCount = confirmed.length;
  const eagerCount = events.filter((e) => e.action === "eager").length;

  // Motivation : taux de confirmation + réactivité (délai envoi->confirmation) + hâte.
  const confirmRate = sentCount > 0 ? confirmedCount / sentCount : 0;
  const delaysH = confirmed
    .filter((e) => e.sent_at && e.confirmed_at)
    .map((e) => (Date.parse(e.confirmed_at as string) - Date.parse(e.sent_at as string)) / 3_600_000)
    .filter((h) => h >= 0);
  const avgDelayH = delaysH.length ? delaysH.reduce((s, x) => s + x, 0) / delaysH.length : 24;
  // réactivité : <2h = 100, 24h = ~50, >48h = bas.
  const reactivity = clamp(100 - (avgDelayH / 48) * 100);
  const eagerBonus = sentCount > 0 ? Math.min(20, (eagerCount / sentCount) * 40) : 0;
  const motivation = clamp(confirmRate * 60 + reactivity * 0.3 + eagerBonus);

  // Profil de lecture : médiane des temps de lecture.
  const secs = confirmed.map((e) => e.reading_seconds).filter((s): s is number => typeof s === "number" && s > 0).sort((a, b) => a - b);
  const medianReadingSec = secs.length ? secs[Math.floor(secs.length / 2)] : null;
  const readingProfile = readingScoreFromMedian(medianReadingSec);

  // Examens.
  const { data: exRaw } = await admin
    .from("training_exam_results")
    .select("module_seq, level, score, total, taken_at")
    .eq("employee_id", employeeId)
    .order("module_seq", { ascending: true });
  const exams: ExamResultView[] = ((exRaw ?? []) as Array<{ module_seq: number; level: number | null; score: number; total: number; taken_at: string }>).map((x) => ({
    module_seq: x.module_seq, level: x.level, score: x.score, total: x.total,
    pct: x.total > 0 ? Math.round((x.score / x.total) * 100) : 0, taken_at: x.taken_at,
  }));
  const examAvg = exams.length ? clamp(exams.reduce((s, x) => s + x.pct, 0) / exams.length) : 0;

  // Cohérence lecture ↔ examens : proches = cohérent (lecture sérieuse confirmée par
  // les résultats ; ou survol confirmé par de faibles scores). Divergence = à creuser.
  const coherence = exams.length ? clamp(100 - Math.abs(readingProfile - examAvg)) : null;

  // Pouls + bilan.
  const { data: poulsRaw } = await admin.from("training_sentiment").select("feeling, note, answered_at, asked_at").eq("employee_id", employeeId).order("asked_at", { ascending: false });
  const pouls = (poulsRaw ?? []) as PoulsView[];
  const { data: exitRaw } = await admin.from("training_exit_survey").select("submitted_at, rating_training, rating_colleagues, rating_work, rating_salary, rating_schedule, free_text, available_again, wants_candidate").eq("employee_id", employeeId).maybeSingle();
  const exit = (exitRaw as TrainingScore["exit"]) ?? null;

  const progressionPct = total > 0 ? Math.round((enr.current_seq / total) * 100) : 0;

  // Score global pondéré.
  const overall = clamp(examAvg * 0.35 + motivation * 0.3 + readingProfile * 0.2 + progressionPct * 0.15);

  // Recommandation (non bloquante). Besoin d'un minimum de données.
  let recommendation: TrainingScore["recommendation"] = "insuffisant_data";
  let recommendationLabel = "Données insuffisantes pour se prononcer";
  if (confirmedCount >= 3 || exams.length >= 1) {
    if (overall >= 70) { recommendation = "favorable"; recommendationLabel = "Plutôt FAVORABLE au renouvellement"; }
    else if (overall >= 45) { recommendation = "mitige"; recommendationLabel = "MITIGÉ — à discuter"; }
    else { recommendation = "vigilance"; recommendationLabel = "POINTS DE VIGILANCE"; }
  }

  const score: TrainingScore = {
    hasEnrollment: true, status: enr.status, currentSeq: enr.current_seq, total, progressionPct,
    motivation, readingProfile, examAvg, coherence, overall, recommendation, recommendationLabel,
    exams, pouls, exit, confirmedCount, eagerCount, medianReadingSec,
  };

  // Snapshot (best-effort).
  try {
    await admin.from("training_scores").upsert(
      { employee_id: employeeId, motivation, reading_profile: readingProfile, exam_avg: examAvg, overall, coherence, updated_at: new Date().toISOString() },
      { onConflict: "employee_id" },
    );
  } catch {
    /* non bloquant */
  }

  return score;
}
