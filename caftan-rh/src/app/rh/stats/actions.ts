"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

interface ExportRow {
  employee_id: string | null;
  full_name: string;
  job_title: string | null;
  iban: string | null;
  period_year: number;
  period_month: number;
  period_label: string | null;
  gross_amount: number;
  net_amount: number;
  amount_to_pay: number;
  payment_status: string;
  paid_at: string | null;
  employer_org_key: string;
}

async function fetchRows(year: number, employer: string): Promise<ExportRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from("payslips")
    .select("employee_id, period_year, period_month, period_label, gross_amount, net_amount, amount_to_pay, payment_status, paid_at, employer_org_key, employee:employees(full_name, job_title, iban)")
    .eq("period_year", year);
  if (employer !== "all") q = q.eq("employer_org_key", employer);
  const { data } = await q;
  return ((data ?? []) as Array<{
    employee_id: string | null;
    period_year: number;
    period_month: number;
    period_label: string | null;
    gross_amount: number | null;
    net_amount: number;
    amount_to_pay: number;
    payment_status: string;
    paid_at: string | null;
    employer_org_key: string;
    employee?: { full_name: string; job_title: string | null; iban: string | null } | null;
  }>).map((r) => ({
    employee_id: r.employee_id,
    full_name: r.employee?.full_name ?? "(orphan)",
    job_title: r.employee?.job_title ?? null,
    iban: r.employee?.iban ?? null,
    period_year: r.period_year,
    period_month: r.period_month,
    period_label: r.period_label,
    gross_amount: Number(r.gross_amount ?? 0),
    net_amount: Number(r.net_amount),
    amount_to_pay: Number(r.amount_to_pay),
    payment_status: r.payment_status,
    paid_at: r.paid_at,
    employer_org_key: r.employer_org_key,
  }));
}

export async function exportPayslipsCsvAction(opts: { year: number; employer: string }): Promise<{ ok: boolean; csv?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  try {
    const rows = await fetchRows(opts.year, opts.employer);
    const headers = [
      "Employeur", "Periode_Annee", "Periode_Mois", "Periode_Libelle",
      "Employee_ID", "Nom_Complet", "Fonction", "IBAN",
      "Brut_EUR", "Net_EUR", "A_Payer_EUR", "Statut_Paiement", "Date_Paiement",
    ];
    const lines = [headers.join(";")];
    for (const r of rows) {
      const fields = [
        r.employer_org_key,
        r.period_year,
        r.period_month,
        (r.period_label ?? "").replace(/[;\n]/g, " "),
        r.employee_id ?? "",
        r.full_name.replace(/[;\n]/g, " "),
        (r.job_title ?? "").replace(/[;\n]/g, " "),
        r.iban ?? "",
        r.gross_amount.toFixed(2).replace(".", ","),
        r.net_amount.toFixed(2).replace(".", ","),
        r.amount_to_pay.toFixed(2).replace(".", ","),
        r.payment_status,
        r.paid_at ?? "",
      ];
      lines.push(fields.join(";"));
    }
    return { ok: true, csv: lines.join("\n") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Karim 2026-06-03 : export XML compatible Winbooks (format minimal).
 * Note : Winbooks accepte plusieurs formats. Cette version est un XML
 * structure simple type "Imputations". A adapter selon comptable.
 */
export async function exportPayslipsWinbooksXmlAction(opts: { year: number; employer: string }): Promise<{ ok: boolean; xml?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  try {
    const rows = await fetchRows(opts.year, opts.employer);
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<WinbooksImport export="${new Date().toISOString().slice(0, 10)}" year="${opts.year}" employer="${opts.employer}">`,
      '  <Imputations>',
    ];
    for (const r of rows) {
      const docDate = r.paid_at ?? `${r.period_year}-${String(r.period_month).padStart(2, "0")}-01`;
      lines.push(`    <Imputation>`);
      lines.push(`      <Date>${docDate.slice(0, 10)}</Date>`);
      lines.push(`      <Periode>${r.period_year}-${String(r.period_month).padStart(2, "0")}</Periode>`);
      lines.push(`      <Employeur>${escapeXml(r.employer_org_key)}</Employeur>`);
      lines.push(`      <Tiers>${escapeXml(r.full_name)}</Tiers>`);
      lines.push(`      <Compte>62100</Compte>`); // 62100 = salaires bruts (à adapter)
      lines.push(`      <Libelle>${escapeXml(`Salaire ${r.period_label ?? `${r.period_year}-${r.period_month}`}`)}</Libelle>`);
      lines.push(`      <Debit>${r.gross_amount.toFixed(2)}</Debit>`);
      lines.push(`      <Credit>0.00</Credit>`);
      if (r.iban) lines.push(`      <IBAN>${escapeXml(r.iban)}</IBAN>`);
      lines.push(`    </Imputation>`);
    }
    lines.push('  </Imputations>');
    lines.push('</WinbooksImport>');
    return { ok: true, xml: lines.join("\n") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
