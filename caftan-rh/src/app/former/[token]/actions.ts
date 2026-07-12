"use server";

// Karim 2026-07-12 : actions PUBLIQUES de la page de formation (accès par token du
// travailleur, sans compte). Confirmation de lecture (+ temps de lecture), « hâte
// d'apprendre » (envoie la suivante), et le champ COMMENTAIRE/ANOMALIE (toujours
// dispo en bas de page) qui remonte à l'admin.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { confirmAndMaybeAdvance } from "@/lib/training/drip";
import { sha256, FORM_BIND_COOKIE } from "./binding";
import { revalidatePath } from "next/cache";

/** Verrouille la formation sur CET appareil (1re ouverture) : cookie httpOnly +
 *  empreinte en base. Refusé si déjà liée à un autre appareil. */
export async function bindTrainingDeviceAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 12) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_enrollments")
    .select("id, bound_secret")
    .eq("token", t)
    .maybeSingle();
  const enr = data as { id: string; bound_secret: string | null } | null;
  if (!enr) return { ok: false, error: "Lien invalide." };
  if (enr.bound_secret) return { ok: false, error: "Déjà lié à un appareil." };

  const secret = crypto.randomBytes(24).toString("base64url");
  const { error } = await admin
    .from("training_enrollments")
    .update({ bound_secret: sha256(secret), bound_at: new Date().toISOString() })
    .eq("token", t)
    .is("bound_secret", null); // anti-course : ne lie que si toujours libre
  if (error) return { ok: false, error: error.message };
  const c = await cookies();
  c.set(`${FORM_BIND_COOKIE}_${enr.id}`, secret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  return { ok: true };
}

async function resolveEmployee(token: string): Promise<{ employeeId: string; name: string | null } | null> {
  const t = (token ?? "").trim();
  if (t.length < 12) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("training_enrollments").select("employee_id").eq("token", t).maybeSingle();
  const enr = data as { employee_id: string } | null;
  if (!enr) return null;
  const { data: emp } = await admin.from("employees").select("full_name").eq("id", enr.employee_id).maybeSingle();
  return { employeeId: enr.employee_id, name: (emp as { full_name: string | null } | null)?.full_name ?? null };
}

export async function confirmModuleAction(
  token: string,
  seq: number,
  eager: boolean,
  readingSeconds: number | null,
): Promise<{ ok: boolean; done?: boolean; error?: string }> {
  const who = await resolveEmployee(token);
  if (!who) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const r = await confirmAndMaybeAdvance(admin, who.employeeId, seq, {
    eager,
    readingSeconds: Number.isFinite(readingSeconds as number) ? readingSeconds : null,
  });
  revalidatePath(`/former/${token}`);
  return r;
}

/** Corrige l'examen côté serveur (les bonnes réponses ne quittent jamais le serveur),
 *  enregistre le résultat, avance la formation, et envoie le RAPPORT à l'admin. */
export async function submitExamAction(
  token: string,
  seq: number,
  answers: number[],
  readingSeconds: number | null,
): Promise<{ ok: boolean; score?: number; total?: number; error?: string }> {
  const who = await resolveEmployee(token);
  if (!who) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();

  const { data: modRaw } = await admin
    .from("training_modules")
    .select("questions, exam_level, title_fr")
    .eq("seq", seq)
    .maybeSingle();
  const mod = modRaw as { questions: Array<{ correct: number }> | null; exam_level: number | null; title_fr: string } | null;
  const questions = mod?.questions ?? [];
  if (!Array.isArray(questions) || questions.length === 0) return { ok: false, error: "Examen indisponible." };

  let score = 0;
  questions.forEach((q, i) => {
    if (Number(answers?.[i]) === Number(q.correct)) score += 1;
  });
  const total = questions.length;

  await admin.from("training_exam_results").insert({
    employee_id: who.employeeId,
    module_seq: seq,
    level: mod?.exam_level ?? null,
    score,
    total,
    answers: answers ?? [],
  });

  // Avance la formation (marque la section faite + programme la suivante à 9h).
  await confirmAndMaybeAdvance(admin, who.employeeId, seq, { eager: false, readingSeconds });

  // RAPPORT à l'admin (mail + notif interne) — Karim veut chaque résultat.
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  try {
    const { data: org } = await admin.from("org_settings").select("org_email").eq("id", 1).maybeSingle();
    const to = (org as { org_email?: string | null } | null)?.org_email || "hr@caftanfactory.com";
    const { sendAppMail } = await import("@/lib/app-mail");
    await sendAppMail({
      to,
      subject: `Formation — résultat examen niveau ${mod?.exam_level ?? "?"} : ${who.name ?? "travailleur"} (${score}/${total})`,
      body:
        `Rapport d'examen (formation)\n\n` +
        `Travailleur : ${who.name ?? who.employeeId}\n` +
        `Examen : niveau ${mod?.exam_level ?? "?"} — « ${mod?.title_fr ?? ""} »\n` +
        `Score : ${score}/${total} (${pct}%)\n\n` +
        `Fiche : /planning/employees/${who.employeeId}`,
      source: "training_exam_report",
      employeeId: who.employeeId,
    });
  } catch {
    /* non bloquant */
  }
  try {
    const { notifyRoles } = await import("@/lib/notify");
    await notifyRoles(["admin", "rh"], {
      kind: "training_exam_result",
      title: `Examen niveau ${mod?.exam_level ?? "?"} — ${who.name ?? "travailleur"} : ${score}/${total}`,
      body: `Score ${pct}% à l'examen « ${mod?.title_fr ?? ""} ».`,
      link: `/planning/employees/${who.employeeId}`,
      data: { employee_id: who.employeeId, module_seq: seq, score, total },
    });
  } catch {
    /* non bloquant */
  }

  revalidatePath(`/former/${token}`);
  return { ok: true, score, total };
}

/** Le travailleur choisit son RYTHME : 'daily' (1/jour) ou 'spread30' (étalé). */
export async function setTrainingRhythmAction(
  token: string,
  rhythm: "daily" | "spread30",
): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 12) return { ok: false, error: "Lien invalide." };
  if (rhythm !== "daily" && rhythm !== "spread30") return { ok: false, error: "Rythme invalide." };
  const admin = createAdminClient();
  const { error } = await admin.from("training_enrollments").update({ rhythm }).eq("token", t);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitTrainingFeedbackAction(
  token: string,
  seq: number | null,
  kind: "comment" | "anomaly" | "info",
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const msg = (message ?? "").trim();
  if (!msg) return { ok: false, error: "Message vide." };
  const who = await resolveEmployee(token);
  if (!who) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();

  const { error } = await admin.from("training_feedback").insert({
    employee_id: who.employeeId,
    module_seq: seq,
    kind: kind === "anomaly" || kind === "info" ? kind : "comment",
    message: msg.slice(0, 4000),
  });
  if (error) return { ok: false, error: error.message };

  // Remonte à l'admin/RH (objet précis + lien direct vers la fiche).
  try {
    const { notifyRoles } = await import("@/lib/notify");
    const label = kind === "anomaly" ? "Anomalie signalée" : kind === "info" ? "Info déclarée" : "Commentaire";
    await notifyRoles(["admin", "rh"], {
      kind: "training_feedback",
      title: `${label} (formation) — ${who.name ?? "un travailleur"}`,
      body: msg.slice(0, 200),
      link: `/planning/employees/${who.employeeId}`,
      data: { employee_id: who.employeeId, kind, module_seq: seq },
    });
  } catch {
    /* non bloquant */
  }
  return { ok: true };
}
