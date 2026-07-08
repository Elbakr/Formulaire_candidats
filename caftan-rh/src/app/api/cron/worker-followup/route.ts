// GET /api/cron/worker-followup
//
// Karim 2026-07-08 : ACCOMPAGNEMENT AUTOMATIQUE du travailleur PAR PALIERS.
// Quotidien. Pour chaque travailleur actif (contrat signé, non terminé) :
//   - calcule days = jours calendaires depuis le DÉBUT du contrat (ancre =
//     employees.start_date, la date d'entrée ; le compteur mesure l'ancienneté et
//     n'est PAS remis à zéro par un renouvellement de contrat).
//   - Phase 1 (days ∈ [7,28]) : un palier tous les 7 jours (J+7/14/21/28).
//   - Phase 2 (days ≥ 38)     : un palier tous les 10 jours (J+38/48/58…).
//   Envoie le PLUS RÉCENT palier dû NON encore envoyé (rattrapage), UN SEUL par
//   employé et par run (anti-spam). Anti-doublon strict via worker_followups.
//
// Best-effort : try/catch par employé, ne plante jamais le lot.
// Auth : Bearer CRON_SECRET (identique aux autres crons).
// Planifié sur le slot '0 8 * * *' de .github/workflows/caftan-crons.yml.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { daysBetweenISO, todayISOInBrussels } from "@/lib/datetime";
import { dueMilestonesDesc, sendWorkerFollowup } from "@/lib/worker-followup";

export const dynamic = "force-dynamic";

type EmpRow = {
  id: string;
  start_date: string | null;
  end_date: string | null;
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayISOInBrussels();

  // 1) Travailleurs actifs, non terminés (end_date absente ou pas encore atteinte).
  const { data: empRows, error: empErr } = await admin
    .from("employees")
    .select("id, start_date, end_date")
    .eq("status", "active")
    .not("start_date", "is", null)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 500 });
  }
  const emps = (empRows ?? []) as EmpRow[];
  if (emps.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, employees: 0 });
  }

  // 2) Restreint aux employés qui ont AU MOINS un contrat signé (embauche confirmée).
  const empIds = emps.map((e) => e.id);
  const signedSet = new Set<string>();
  {
    const { data: contracts } = await admin
      .from("employee_contracts")
      .select("employee_id")
      .eq("status", "signed")
      .in("employee_id", empIds);
    for (const c of (contracts ?? []) as Array<{ employee_id: string | null }>) {
      if (c.employee_id) signedSet.add(c.employee_id);
    }
  }

  // 3) Paliers déjà envoyés (anti-doublon groupé) pour éviter des envois inutiles.
  const sentByEmp = new Map<string, Set<string>>();
  {
    const { data: doneRows } = await admin
      .from("worker_followups")
      .select("employee_id, milestone")
      .in("employee_id", empIds);
    for (const r of (doneRows ?? []) as Array<{ employee_id: string; milestone: string }>) {
      let s = sentByEmp.get(r.employee_id);
      if (!s) {
        s = new Set<string>();
        sentByEmp.set(r.employee_id, s);
      }
      s.add(r.milestone);
    }
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ employee_id: string; reason: string }> = [];

  for (const emp of emps) {
    try {
      if (!signedSet.has(emp.id)) {
        skipped++;
        continue;
      }
      if (!emp.start_date) {
        skipped++;
        continue;
      }
      const days = daysBetweenISO(emp.start_date, today);
      const due = dueMilestonesDesc(days);
      if (due.length === 0) {
        skipped++;
        continue;
      }
      // Le PLUS RÉCENT palier dû NON encore envoyé (un seul par run).
      const alreadySent = sentByEmp.get(emp.id) ?? new Set<string>();
      const target = due.find((d) => !alreadySent.has(d.milestone));
      if (!target) {
        skipped++;
        continue;
      }
      const res = await sendWorkerFollowup(admin, emp.id, target.milestone, target.phase);
      if (res.sent) {
        sent++;
      } else {
        skipped++;
        if (res.reason && !/anti-doublon/.test(res.reason)) {
          errors.push({ employee_id: emp.id, reason: res.reason });
        }
      }
    } catch (e) {
      errors.push({ employee_id: emp.id, reason: (e as Error).message });
    }
  }

  console.log(`[cron/worker-followup] sent=${sent} skipped=${skipped} employees=${emps.length}`);
  return NextResponse.json({ ok: true, sent, skipped, employees: emps.length, errors });
}
