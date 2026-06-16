// Karim 2026-05-31 (task #63) : cron quotidien qui notifie les admin RH
// quand une fiche secondaire (double fiche différée J+6) atteint sa date
// de paiement prévue. À planifier 1×/jour via Vercel cron ou scheduler externe.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAppMail } from "@/lib/app-mail";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fiches secondaires dont la date de paiement prevue est atteinte (ou depassee)
  // et qui sont encore 'scheduled' (pas marquées payées)
  const { data: dueSecondary } = await admin
    .from("payslips")
    .select(`
      id, employee_id, period_year, period_month, period_label,
      amount_to_pay, scheduled_payment_date,
      employee:employees(id, full_name, iban)
    `)
    .eq("is_secondary", true)
    .eq("payment_status", "scheduled")
    .lte("scheduled_payment_date", today);

  type Row = {
    id: string;
    employee_id: string | null;
    period_year: number;
    period_month: number;
    period_label: string | null;
    amount_to_pay: number;
    scheduled_payment_date: string;
    employee: { id: string; full_name: string; iban: string | null } | null;
  };
  const rows = (dueSecondary ?? []) as unknown as Row[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  // Update : passe de scheduled -> pending (debloque le paiement)
  const ids = rows.map((r) => r.id);
  await admin
    .from("payslips")
    .update({ payment_status: "pending" })
    .in("id", ids);

  // Cherche admins/rh pour notifier
  const { data: rhs } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["admin", "rh"]);

  // 1 mail par admin/rh listant toutes les fiches dues
  const lines = rows.map((r) =>
    `- ${r.employee?.full_name ?? "Employé"} : ${Number(r.amount_to_pay).toFixed(2)} € (${r.period_label ?? `${r.period_month}/${r.period_year}`}) — initialement différée jusqu'au ${r.scheduled_payment_date}`,
  ).join("\n");

  const subject = `CaftanRH — ${rows.length} fiche${rows.length > 1 ? "s" : ""} secondaire${rows.length > 1 ? "s" : ""} prête${rows.length > 1 ? "s" : ""} à payer`;
  const body = `Bonjour,

Les fiches secondaires différées suivantes ont atteint leur date de paiement minimum (J+6) et sont maintenant prêtes à payer :

${lines}

═══════ ACTION ═══════

Va sur /admin/payslips pour voir le détail et générer les QR de paiement.
Total à payer : ${rows.reduce((sum, r) => sum + Number(r.amount_to_pay), 0).toFixed(2)} €

CaftanRH (cron automatique)
`;

  let notified = 0;
  for (const rh of rhs ?? []) {
    if (!rh.email) continue;
    try {
      const result = await sendAppMail({
        to: rh.email,
        toName: rh.full_name ?? "RH",
        subject,
        body,
        source: "payslip_secondary",
      });
      if (result.ok) notified++;
      else console.error("[payslip-secondary-notify] mail err:", result.error);
    } catch (e) {
      console.error("[payslip-secondary-notify] mail err:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, notified, payslips_unlocked: rows.length });
}
