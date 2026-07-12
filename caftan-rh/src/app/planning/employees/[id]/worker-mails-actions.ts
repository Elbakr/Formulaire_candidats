"use server";

// Karim 2026-07-12 : ces mails ne partent PLUS automatiquement (seul le mail
// post-signature reste auto). L'admin/rh les envoie MANUELLEMENT depuis la fiche.
// Tous en automated:false -> passent le kill-switch.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendWorkerOnboardingSheet } from "@/lib/worker-onboarding-sheet";
import { sendWorkerFollowup, dueMilestone, followupMilestoneLabel } from "@/lib/worker-followup";
import { sendOnboardingReminder } from "@/lib/worker-compliance";

type Res = { ok: boolean; error?: string; info?: string };

/** 1) Fiche d'onboarding (remerciement + essentiels pour démarrer). */
export async function sendOnboardingSheetManualAction(employeeId: string): Promise<Res> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();
  const r = await sendWorkerOnboardingSheet(admin, employeeId, null, { manual: true });
  if (r.sent) revalidatePath(`/planning/employees/${employeeId}`);
  return r.sent ? { ok: true } : { ok: false, error: r.reason ?? "Échec de l'envoi." };
}

/** 2) Mail d'accompagnement : envoie le palier ACTUELLEMENT DÛ (selon l'ancienneté). */
export async function sendFollowupManualAction(employeeId: string): Promise<Res> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();

  const { data: eRaw } = await admin
    .from("employees")
    .select("start_date")
    .eq("id", employeeId)
    .maybeSingle();
  const startDate = (eRaw as { start_date: string | null } | null)?.start_date ?? null;
  if (!startDate) return { ok: false, error: "Date de début manquante sur la fiche." };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const days = Math.round(
    (Date.parse(today + "T00:00:00Z") - Date.parse(startDate.slice(0, 10) + "T00:00:00Z")) / 86_400_000,
  );
  const due = dueMilestone(days);
  if (!due) {
    return { ok: false, info: `Aucun palier de suivi dû actuellement (J+${days}). Prochain palier plus tard.` };
  }
  const r = await sendWorkerFollowup(admin, employeeId, due.milestone, due.phase, { manual: true });
  if (r.sent) {
    revalidatePath(`/planning/employees/${employeeId}`);
    return { ok: true, info: `Palier « ${followupMilestoneLabel(due.milestone)} » envoyé.` };
  }
  return { ok: false, error: r.reason ?? "Échec de l'envoi." };
}

/** 3) Relance du questionnaire d'accueil (si un envoi est en attente, non complété). */
export async function sendOnboardingReminderManualAction(employeeId: string): Promise<Res> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();

  const { data: eRaw } = await admin
    .from("employees")
    .select("id, email, full_name, candidate_id")
    .eq("id", employeeId)
    .maybeSingle();
  const emp = eRaw as { id: string; email: string | null; full_name: string | null; candidate_id: string | null } | null;
  if (!emp) return { ok: false, error: "Travailleur introuvable." };
  if (!emp.email) return { ok: false, error: "Aucun email sur la fiche." };
  if (!emp.candidate_id) return { ok: false, error: "Pas de candidature liée (questionnaire introuvable)." };

  const { data: apps } = await admin
    .from("applications")
    .select("id")
    .eq("candidate_id", emp.candidate_id);
  const appIds = ((apps ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (appIds.length === 0) return { ok: false, error: "Aucune candidature liée." };

  const { data: piRaw } = await admin
    .from("pre_interviews")
    .select("token, language_code, status")
    .in("application_id", appIds)
    .eq("context", "onboarding")
    .neq("status", "completed")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pi = piRaw as { token: string; language_code: string | null } | null;
  if (!pi?.token) {
    return { ok: false, info: "Aucun questionnaire d'accueil en attente (déjà complété ou non envoyé)." };
  }

  const r = await sendOnboardingReminder(admin, {
    employeeId,
    email: emp.email,
    fullName: emp.full_name,
    preInterviewToken: pi.token,
    languageCode: pi.language_code,
    manual: true,
  });
  if (r.ok) revalidatePath(`/planning/employees/${employeeId}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Échec de l'envoi." };
}
