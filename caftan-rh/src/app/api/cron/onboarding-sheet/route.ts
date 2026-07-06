// GET /api/cron/onboarding-sheet
//
// Karim 2026-07-06 : envoie AUTOMATIQUEMENT au nouveau travailleur la FICHE
// EXPLICATIVE d'onboarding (remerciement + les essentiels pour bien démarrer)
// ~15 min APRÈS qu'il a rempli son questionnaire d'accueil.
//
// Sélection : pre_interviews context='onboarding', status='completed', complété
//   il y a >= 15 min ET < 24h (fenêtre de rattrapage), qui n'ont PAS encore reçu
//   la fiche (anti-doublon via outbound_mails source `worker_onboarding_sheet`).
//
// Résolution travailleur : pre_interviews.application_id -> applications.candidate_id
//   -> employees.candidate_id (email + full_name).
//
// Cadence : branché sur le schedule '*/10 * * * *' du workflow GitHub Actions
//   (.github/workflows/caftan-crons.yml) — voir MAP. ~10 min de granularité, ce
//   qui, combiné au délai minimum de 15 min, envoie la fiche ~15-25 min après la
//   complétion. Fenêtre de 24h = filet si un run est sauté.
//
// Auth : Bearer CRON_SECRET (identique aux autres crons).

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWorkerOnboardingSheet } from "@/lib/worker-onboarding-sheet";

export const dynamic = "force-dynamic";

const SOURCE = "worker_onboarding_sheet";
const MIN_DELAY_MIN = 15; // au moins 15 min écoulées depuis la complétion
const WINDOW_HOURS = 24; // au plus 24h (filet de rattrapage)

type PiRow = {
  id: string;
  application_id: string | null;
  completed_at: string | null;
  language_code: string | null;
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const readyBefore = new Date(now - MIN_DELAY_MIN * 60 * 1000).toISOString();
  const windowStart = new Date(now - WINDOW_HOURS * 3600 * 1000).toISOString();

  // 1) Questionnaires d'accueil complétés dans la fenêtre [now-24h, now-15min].
  const { data: piRows, error: piErr } = await admin
    .from("pre_interviews")
    .select("id, application_id, completed_at, language_code")
    .eq("context", "onboarding")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("completed_at", windowStart)
    .lte("completed_at", readyBefore)
    .order("completed_at", { ascending: true })
    .limit(100);

  if (piErr) {
    return NextResponse.json({ error: piErr.message }, { status: 500 });
  }

  const pis = ((piRows ?? []) as PiRow[]).filter((p) => p.application_id);
  if (pis.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
  }

  // 2) application_id -> candidate_id.
  const appIds = Array.from(new Set(pis.map((p) => p.application_id as string)));
  const { data: appRows } = await admin
    .from("applications")
    .select("id, candidate_id")
    .in("id", appIds);
  const candByApp = new Map<string, string>();
  for (const a of (appRows ?? []) as Array<{ id: string; candidate_id: string | null }>) {
    if (a.candidate_id) candByApp.set(a.id, a.candidate_id);
  }

  // 3) candidate_id -> employee (id, candidate_id).
  const candIds = Array.from(new Set(Array.from(candByApp.values())));
  const empByCand = new Map<string, string>();
  if (candIds.length > 0) {
    const { data: empRows } = await admin
      .from("employees")
      .select("id, candidate_id")
      .in("candidate_id", candIds);
    for (const e of (empRows ?? []) as Array<{ id: string; candidate_id: string | null }>) {
      if (e.candidate_id && !empByCand.has(e.candidate_id)) empByCand.set(e.candidate_id, e.id);
    }
  }

  // 4) Anti-doublon groupé : employés ayant déjà reçu la fiche (status sent).
  const employeeIds = Array.from(new Set(Array.from(empByCand.values())));
  const alreadySent = new Set<string>();
  if (employeeIds.length > 0) {
    const { data: sentRows } = await admin
      .from("outbound_mails")
      .select("employee_id")
      .eq("source", SOURCE)
      .eq("status", "sent")
      .in("employee_id", employeeIds);
    for (const r of (sentRows ?? []) as Array<{ employee_id: string | null }>) {
      if (r.employee_id) alreadySent.add(r.employee_id);
    }
  }

  // 5) Envoi best-effort (try/catch par item — un échec n'arrête pas le lot).
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ pi_id: string; reason: string }> = [];
  const done = new Set<string>(); // évite un 2e envoi si 2 pre_interviews -> même employé

  for (const pi of pis) {
    const candId = candByApp.get(pi.application_id as string);
    const empId = candId ? empByCand.get(candId) : undefined;
    if (!empId) {
      skipped++;
      continue;
    }
    if (alreadySent.has(empId) || done.has(empId)) {
      skipped++;
      continue;
    }
    try {
      const res = await sendWorkerOnboardingSheet(admin, empId, pi.language_code);
      if (res.sent) {
        sent++;
        done.add(empId);
      } else {
        skipped++;
        if (res.reason && !/anti-doublon/.test(res.reason)) {
          errors.push({ pi_id: pi.id, reason: res.reason });
        }
        // Marque done pour ne pas re-tenter le même employé sur ce run.
        done.add(empId);
      }
    } catch (e) {
      errors.push({ pi_id: pi.id, reason: (e as Error).message });
    }
  }

  console.log(`[cron/onboarding-sheet] sent=${sent} skipped=${skipped} candidates=${pis.length}`);
  return NextResponse.json({ ok: true, sent, skipped, candidates: pis.length, errors });
}
