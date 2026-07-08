// GET /api/cron/onboarding-followup
//
// Karim 2026-07-08 : PHASE 1 « conformité travailleur ».
//   1) RELANCE questionnaire d'accueil : pre_interviews context='onboarding' NON
//      complété, sent_at >= 24h et pas encore relancé -> mail (source
//      `onboarding_reminder`, automated:true, whitelisté) + pose reminded_at.
//   2) MANQUEMENT questionnaire : sent_at >= 48h et toujours pas complété ->
//      worker_compliance_events (kind='questionnaire_non_complete') anti-doublon
//      + escalade RH (notifyRoles).
//   3) MANQUEMENT guide : worker_document_acks.sent_at >= 72h et confirmed_at null
//      -> worker_compliance_events (kind='guide_non_confirme') anti-doublon + escalade.
//
// Best-effort : try/catch par item, 1 action par item/run, log des compteurs.
// Auth : Bearer CRON_SECRET (comme les autres crons).

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { recordComplianceEventOnce, sendOnboardingReminder } from "@/lib/worker-compliance";

export const dynamic = "force-dynamic";

const H = 3600 * 1000;

type PiRow = {
  id: string;
  application_id: string | null;
  sent_at: string | null;
  token: string;
  language_code: string | null;
  reminded_at: string | null;
};

type Emp = { id: string; email: string | null; full_name: string | null };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now - 30 * 24 * H).toISOString(); // borne : 30 jours
  const before24h = new Date(now - 24 * H).toISOString();

  let reminded = 0;
  let questionnaireGaps = 0;
  let guideGaps = 0;
  const errors: Array<{ ref: string; reason: string }> = [];

  // ─── 1+2) Questionnaire d'accueil non complété ────────────────────────────
  const { data: piRaw, error: piErr } = await admin
    .from("pre_interviews")
    .select("id, application_id, sent_at, token, language_code, reminded_at")
    .eq("context", "onboarding")
    .neq("status", "completed")
    .not("sent_at", "is", null)
    .gte("sent_at", windowStart)
    .lte("sent_at", before24h)
    .order("sent_at", { ascending: true })
    .limit(200);

  if (piErr) return NextResponse.json({ error: piErr.message }, { status: 500 });

  const pis = ((piRaw ?? []) as PiRow[]).filter((p) => p.application_id);

  // Résolution employé : application_id -> candidate_id -> employee.
  const empByPi = new Map<string, Emp>();
  if (pis.length > 0) {
    const appIds = Array.from(new Set(pis.map((p) => p.application_id as string)));
    const { data: appRows } = await admin
      .from("applications")
      .select("id, candidate_id")
      .in("id", appIds);
    const candByApp = new Map<string, string>();
    for (const a of (appRows ?? []) as Array<{ id: string; candidate_id: string | null }>) {
      if (a.candidate_id) candByApp.set(a.id, a.candidate_id);
    }
    const candIds = Array.from(new Set(Array.from(candByApp.values())));
    const empByCand = new Map<string, Emp>();
    if (candIds.length > 0) {
      const { data: empRows } = await admin
        .from("employees")
        .select("id, email, full_name, candidate_id")
        .in("candidate_id", candIds);
      for (const e of (empRows ?? []) as Array<Emp & { candidate_id: string | null }>) {
        if (e.candidate_id && !empByCand.has(e.candidate_id)) {
          empByCand.set(e.candidate_id, { id: e.id, email: e.email, full_name: e.full_name });
        }
      }
    }
    for (const p of pis) {
      const candId = candByApp.get(p.application_id as string);
      const emp = candId ? empByCand.get(candId) : undefined;
      if (emp) empByPi.set(p.id, emp);
    }
  }

  for (const p of pis) {
    const emp = empByPi.get(p.id);
    if (!emp) continue;
    const ageMs = now - new Date(p.sent_at as string).getTime();
    try {
      // >= 48h : MANQUEMENT questionnaire (une action pour cet item).
      if (ageMs >= 48 * H) {
        const created = await recordComplianceEventOnce(admin, {
          employeeId: emp.id,
          kind: "questionnaire_non_complete",
          title: "Questionnaire d'accueil non complété (48h+)",
          detail: "Le travailleur n'a pas complété son questionnaire d'accueil malgré la relance.",
          malus: 1,
        });
        if (created) {
          questionnaireGaps++;
          const name = (emp.full_name ?? "").trim() || "un travailleur";
          await notifyRoles(["admin", "rh"], {
            kind: "compliance_gap",
            title: `Manquement : ${name} n'a pas complété son questionnaire d'accueil`,
            body: "48h après l'envoi, toujours pas complété (relance déjà tentée).",
            link: `/planning/employees/${emp.id}`,
            data: { employee_id: emp.id, kind: "questionnaire_non_complete" },
          });
        }
        continue;
      }
      // [24h, 48h) et pas encore relancé : RELANCE.
      if (ageMs >= 24 * H && !p.reminded_at) {
        if (!emp.email) continue;
        const res = await sendOnboardingReminder(admin, {
          employeeId: emp.id,
          email: emp.email,
          fullName: emp.full_name,
          preInterviewToken: p.token,
          languageCode: p.language_code,
        });
        // Marque reminded_at même si l'envoi a échoué faute d'anti-boucle
        // (le mail est loggé ; on ne veut pas spammer à chaque run).
        await admin.from("pre_interviews").update({ reminded_at: new Date().toISOString() }).eq("id", p.id);
        if (res.ok) reminded++;
        else errors.push({ ref: `pi:${p.id}`, reason: res.error ?? "envoi KO" });
        continue;
      }
    } catch (e) {
      errors.push({ ref: `pi:${p.id}`, reason: (e as Error).message });
    }
  }

  // ─── 3) Guide conduite envoyé mais non confirmé depuis >= 72h ──────────────
  const before72h = new Date(now - 72 * H).toISOString();
  const guideWindowStart = new Date(now - 60 * 24 * H).toISOString();
  const { data: ackRaw } = await admin
    .from("worker_document_acks")
    .select("employee_id, sent_at")
    .eq("document_key", "guide_conduite")
    .is("confirmed_at", null)
    .not("sent_at", "is", null)
    .gte("sent_at", guideWindowStart)
    .lte("sent_at", before72h)
    .limit(200);

  const acks = (ackRaw ?? []) as Array<{ employee_id: string; sent_at: string | null }>;
  if (acks.length > 0) {
    const empIds = Array.from(new Set(acks.map((a) => a.employee_id)));
    const { data: empRows } = await admin
      .from("employees")
      .select("id, full_name")
      .in("id", empIds);
    const nameById = new Map<string, string | null>();
    for (const e of (empRows ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(e.id, e.full_name);
    }
    for (const a of acks) {
      try {
        const created = await recordComplianceEventOnce(admin, {
          employeeId: a.employee_id,
          kind: "guide_non_confirme",
          title: "Guide conduite non confirmé (72h+)",
          detail: "Le guide conduite a été envoyé mais n'a pas été confirmé (lu/compris/assimilé/accepté).",
          malus: 1,
        });
        if (created) {
          guideGaps++;
          const name = (nameById.get(a.employee_id) ?? "").trim() || "un travailleur";
          await notifyRoles(["admin", "rh"], {
            kind: "compliance_gap",
            title: `Manquement : ${name} n'a pas confirmé le guide conduite`,
            body: "72h après l'envoi, toujours pas confirmé.",
            link: `/planning/employees/${a.employee_id}`,
            data: { employee_id: a.employee_id, kind: "guide_non_confirme" },
          });
        }
      } catch (e) {
        errors.push({ ref: `ack:${a.employee_id}`, reason: (e as Error).message });
      }
    }
  }

  console.log(
    `[cron/onboarding-followup] reminded=${reminded} questionnaireGaps=${questionnaireGaps} guideGaps=${guideGaps} errors=${errors.length}`,
  );
  return NextResponse.json({ ok: true, reminded, questionnaireGaps, guideGaps, errors });
}
