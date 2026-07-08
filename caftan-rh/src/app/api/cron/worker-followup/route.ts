// GET /api/cron/worker-followup
//
// Karim 2026-07-08 : ACCOMPAGNEMENT AUTOMATIQUE du travailleur PAR PALIERS.
// Quotidien. Pour chaque travailleur actif (contrat signé, non terminé) :
//   - ACCOMPAGNEMENT (1 mail max / employé / run) :
//       • si le contrat a été RENOUVELÉ (≥ 2 contrats signés) et que la série
//         renouvellement n'est pas terminée → palier renouvellement dû (ancré sur
//         le DÉBUT du contrat renouvelé le plus récent) : rnw_welcome (J0),
//         rnw_5_1/2/3 (J+5/10/15), rnw_8_1/2/3 (J+23/31/39). PRIME sur Phase 1/2.
//       • sinon (1er contrat) → Phase 1 (J+7/14/21/28) puis Phase 2 (J+38/48/58…).
//         Un travailleur renouvelé NE reçoit PAS la Phase 1 ; après la série,
//         la Phase 2 (ancrée sur l'ancienneté) reprend.
//   - RAPPEL FIN DE CONTRAT (1 mail max / employé / run, INDÉPENDANT) :
//       • pour chaque contrat signé avec end_date, si end_date - aujourd'hui
//         ∈ ]0,15] jours → un rappel unique `end_reminder_<contractId>`.
//   Envoie le PLUS RÉCENT palier dû NON encore envoyé (rattrapage). Anti-doublon
//   strict via worker_followups (unique (employee_id, milestone)).
//
// Best-effort : try/catch par employé, ne plante jamais le lot.
// Auth : Bearer CRON_SECRET (identique aux autres crons).
// Planifié sur le slot '0 8 * * *' de .github/workflows/caftan-crons.yml.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { daysBetweenISO, todayISOInBrussels } from "@/lib/datetime";
import {
  dueMilestonesDesc,
  dueRenewalMilestonesDesc,
  RENEWAL_MILESTONES,
  sendWorkerFollowup,
  sendRenewalFollowup,
  sendEndReminder,
} from "@/lib/worker-followup";

export const dynamic = "force-dynamic";

type EmpRow = {
  id: string;
  start_date: string | null;
  end_date: string | null;
};

type ContractRow = {
  id: string;
  employee_id: string | null;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
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

  // 2) Contrats SIGNÉS de ces employés — sert à : (a) filtrer les embauches
  //    confirmées, (b) détecter le RENOUVELLEMENT (≥ 2 signés) + son ancre,
  //    (c) alimenter le rappel FIN DE CONTRAT (contrats à end_date).
  const empIds = emps.map((e) => e.id);
  const signedCount = new Map<string, number>();
  // Ancre renouvellement = start_date du DERNIER contrat signé (signed_at desc).
  const latestSigned = new Map<string, { start: string | null; signedAt: string | null }>();
  // Contrats CDD (end_date non nulle) par employé, pour le rappel J-15.
  const endContractsByEmp = new Map<string, Array<{ id: string; endDate: string }>>();
  // Tous les contrats signés par employé, pour calculer le NUMÉRO (ordinal) de
  // chaque contrat (1er, 2e, 3e…) → adapte le TON du rappel fin de contrat.
  const allSignedByEmp = new Map<string, ContractRow[]>();
  // contractId → n° du contrat dans la séquence chronologique du travailleur.
  const contractOrdinal = new Map<string, number>();
  {
    const { data: contracts } = await admin
      .from("employee_contracts")
      .select("id, employee_id, start_date, end_date, signed_at")
      .eq("status", "signed")
      .in("employee_id", empIds);
    for (const c of (contracts ?? []) as ContractRow[]) {
      const eid = c.employee_id;
      if (!eid) continue;
      signedCount.set(eid, (signedCount.get(eid) ?? 0) + 1);
      // Le plus récent : signed_at desc, puis start_date desc en secours.
      const cur = latestSigned.get(eid);
      const better =
        !cur ||
        ((c.signed_at ?? "") > (cur.signedAt ?? "")) ||
        ((c.signed_at ?? "") === (cur.signedAt ?? "") && (c.start_date ?? "") > (cur.start ?? ""));
      if (better) latestSigned.set(eid, { start: c.start_date, signedAt: c.signed_at });
      let all = allSignedByEmp.get(eid);
      if (!all) {
        all = [];
        allSignedByEmp.set(eid, all);
      }
      all.push(c);
      if (c.end_date) {
        let list = endContractsByEmp.get(eid);
        if (!list) {
          list = [];
          endContractsByEmp.set(eid, list);
        }
        list.push({ id: c.id, endDate: c.end_date.slice(0, 10) });
      }
    }
    // Ordinal = rang chronologique (signed_at asc, puis start_date asc, puis id).
    for (const [, list] of allSignedByEmp) {
      list
        .slice()
        .sort(
          (a, b) =>
            (a.signed_at ?? "").localeCompare(b.signed_at ?? "") ||
            (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
            a.id.localeCompare(b.id),
        )
        .forEach((c, i) => contractOrdinal.set(c.id, i + 1));
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

  let sent = 0; // accompagnement
  let endSent = 0; // rappels fin de contrat
  let skipped = 0;
  const errors: Array<{ employee_id: string; reason: string }> = [];

  for (const emp of emps) {
    try {
      if ((signedCount.get(emp.id) ?? 0) < 1) {
        skipped++;
        continue;
      }
      if (!emp.start_date) {
        skipped++;
        continue;
      }
      const alreadySent = sentByEmp.get(emp.id) ?? new Set<string>();
      const renewed = (signedCount.get(emp.id) ?? 0) >= 2;
      const anchor = latestSigned.get(emp.id)?.start ?? null;

      // ── A. ACCOMPAGNEMENT (1 mail max) ────────────────────────────────────
      let accompanimentDone = false;
      if (renewed && anchor) {
        // Palier renouvellement le PLUS RÉCENT dû non encore envoyé.
        const daysR = daysBetweenISO(anchor, today);
        const rnwDue = dueRenewalMilestonesDesc(daysR);
        const rnwTarget = rnwDue.find((d) => !alreadySent.has(d.milestone));
        if (rnwTarget) {
          const res = await sendRenewalFollowup(admin, emp.id, rnwTarget.milestone);
          if (res.sent) {
            sent++;
            accompanimentDone = true;
          } else {
            if (res.reason && !/anti-doublon/.test(res.reason)) {
              errors.push({ employee_id: emp.id, reason: `renewal: ${res.reason}` });
            }
          }
        }
        // Si tous les paliers renouvellement sont envoyés → on retombe sur Phase 2.
      }

      // Série renouvellement ENCORE en cours (ancre connue, pas tous les paliers
      // envoyés) : on NE bascule PAS sur Phase 1/2 entre deux paliers.
      const renewalActive =
        renewed && !!anchor && !RENEWAL_MILESTONES.every((m) => alreadySent.has(m.milestone));

      if (!accompanimentDone && !renewalActive) {
        const tenure = daysBetweenISO(emp.start_date, today);
        let due = dueMilestonesDesc(tenure);
        // Renouvelé : la Phase 1 (1er contrat) ne s'applique pas — Phase 2 seule.
        if (renewed) due = due.filter((d) => d.phase === "p2");
        const target = due.find((d) => !alreadySent.has(d.milestone));
        if (target) {
          const res = await sendWorkerFollowup(admin, emp.id, target.milestone, target.phase);
          if (res.sent) {
            sent++;
            accompanimentDone = true;
          } else if (res.reason && !/anti-doublon/.test(res.reason)) {
            errors.push({ employee_id: emp.id, reason: res.reason });
          }
        }
      }
      if (!accompanimentDone) skipped++;

      // ── B. RAPPEL FIN DE CONTRAT (1 mail max, indépendant) ────────────────
      // Contrat à terme le PLUS PROCHE dans ]0,15] jours, non encore rappelé.
      const endList = endContractsByEmp.get(emp.id) ?? [];
      const candidates = endList
        .map((c) => ({ id: c.id, daysLeft: daysBetweenISO(today, c.endDate) }))
        .filter((c) => c.daysLeft > 0 && c.daysLeft <= 15 && !alreadySent.has(`end_reminder_${c.id}`))
        .sort((a, b) => a.daysLeft - b.daysLeft);
      const endTarget = candidates[0];
      if (endTarget) {
        // N° DU CONTRAT QUI SE TERMINE (1er/2e/3e…) → ton du rappel. On prend
        // l'ordinal exact de ce contrat (et non le total signé) pour rester
        // cohérent même si un contrat plus ancien venait à se terminer.
        const contractNumber = contractOrdinal.get(endTarget.id) ?? (signedCount.get(emp.id) ?? 1);
        const res = await sendEndReminder(admin, emp.id, endTarget.id, endTarget.daysLeft, contractNumber);
        if (res.sent) {
          endSent++;
        } else if (res.reason && !/anti-doublon/.test(res.reason)) {
          errors.push({ employee_id: emp.id, reason: `end: ${res.reason}` });
        }
      }
    } catch (e) {
      errors.push({ employee_id: emp.id, reason: (e as Error).message });
    }
  }

  console.log(
    `[cron/worker-followup] sent=${sent} endSent=${endSent} skipped=${skipped} employees=${emps.length}`,
  );
  return NextResponse.json({ ok: true, sent, endSent, skipped, employees: emps.length, errors });
}
