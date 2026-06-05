// Karim 2026-06-03 : cron 1er du mois 7h - envoie rapport KPI du mois écoulé
// à elbazikarim@gmail.com (et tous les admins). Vue d'ensemble pour pilotage.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublicBaseUrl } from "@/lib/public-base-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  // Mois précédent
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // dernier jour du mois précédent
  const period = `${MONTH_NAMES[lastMonth.getMonth()]} ${lastMonth.getFullYear()}`;
  const startISO = lastMonth.toISOString().slice(0, 10);
  const endISO = lastMonthEnd.toISOString().slice(0, 10);

  // Récup KPIs
  const { data: payslips } = await admin.from("payslips")
    .select("net_amount, amount_to_pay, payment_status")
    .eq("period_year", lastMonth.getFullYear())
    .eq("period_month", lastMonth.getMonth() + 1);
  const totalNet = (payslips ?? []).reduce((s, p) => s + Number(p.net_amount), 0);
  const totalToPay = (payslips ?? []).reduce((s, p) => s + Number(p.amount_to_pay), 0);
  const paid = (payslips ?? []).filter((p) => p.payment_status === "paid").length;
  const unpaid = (payslips ?? []).length - paid;

  const { count: newCandidates } = await admin.from("candidates")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startISO).lte("created_at", endISO);

  const { count: newEmployees } = await admin.from("employees")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startISO).lte("created_at", endISO);

  const { count: newTerminations } = await admin.from("contract_terminations")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", startISO).lte("requested_at", endISO);

  const { count: pendingDimona } = await admin.from("dimona_declarations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending").eq("kind", "in");

  const { count: pendingExpenses } = await admin.from("expense_reports")
    .select("id", { count: "exact", head: true }).eq("status", "pending");

  const { count: expiredTrainings } = await admin.from("training_records")
    .select("id", { count: "exact", head: true }).eq("status", "expired");

  // Body
  const body = `Salut Karim,

═══════════════════════════════════════════════════
RAPPORT MENSUEL — ${period.toUpperCase()}
═══════════════════════════════════════════════════

💰 PAIE
   Total Net   : ${totalNet.toFixed(0)} €
   À payer     : ${totalToPay.toFixed(0)} €
   Fiches      : ${payslips?.length ?? 0} (${paid} payées / ${unpaid} en attente)

👥 EFFECTIF
   Nouveaux candidats   : ${newCandidates ?? 0}
   Nouvelles embauches  : ${newEmployees ?? 0}
   Départs (ruptures)   : ${newTerminations ?? 0}

⚠ ALERTES URGENTES
   Dimona IN pending    : ${pendingDimona ?? 0} ${(pendingDimona ?? 0) > 0 ? "🚨 (sanctions ONSS si > 1er jour)" : "✓"}
   Notes frais à valider: ${pendingExpenses ?? 0}
   Formations expirées  : ${expiredTrainings ?? 0}

═══════════════════════════════════════════════════
ACTIONS RECOMMANDÉES
═══════════════════════════════════════════════════

${(pendingDimona ?? 0) > 0 ? `→ Déclarer les ${pendingDimona} Dimona IN sur https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm\n` : ""}${unpaid > 0 ? `→ ${unpaid} fiches de paie à payer (priorité élevée)\n` : ""}${(pendingExpenses ?? 0) > 0 ? `→ Valider les ${pendingExpenses} notes de frais\n` : ""}${(expiredTrainings ?? 0) > 0 ? `→ ${expiredTrainings} formations expirées à renouveler\n` : ""}
═══════════════════════════════════════════════════

Liens utiles :
• Stats détaillées : ${getPublicBaseUrl()}/rh/stats
• Dashboard mobile : ${getPublicBaseUrl()}/m
• Notes de frais   : ${getPublicBaseUrl()}/rh/expenses
• Dimona dashboard : ${getPublicBaseUrl()}/rh/dimona

— CaftanRH (rapport auto mensuel)
`;

  // Envoi
  let sent = false;
  try {
    const { sendMailWithAttachments } = await import("@/lib/mail-with-attachments");
    const result = await sendMailWithAttachments({
      to: "elbazikarim@gmail.com",
      toName: "Karim Elbazi",
      subject: `📊 CaftanRH — Rapport mensuel ${period}`,
      body,
      bccHr: true,
    });
    sent = result.ok;
  } catch (e) {
    console.warn("[monthly-report] err:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    period,
    sent,
    kpis: {
      totalNet: totalNet.toFixed(0),
      totalToPay: totalToPay.toFixed(0),
      payslipsCount: payslips?.length ?? 0,
      paid, unpaid,
      newCandidates, newEmployees, newTerminations,
      pendingDimona, pendingExpenses, expiredTrainings,
    },
  });
}
