// Karim 2026-06-03 : page admin/RH pour valider les notes de frais.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ExpenseActionsRow } from "./actions-row";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "À valider", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  approved: { label: "Validée - à payer", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  paid: { label: "Payée", cls: "bg-green-100 text-green-900 border-green-300" },
  refused: { label: "Refusée", cls: "bg-red-100 text-red-900 border-red-300" },
  cancelled: { label: "Annulée", cls: "bg-gray-100 text-gray-700 border-gray-300" },
};

const CATEGORY_LABEL: Record<string, string> = {
  transport: "🚇 Transport", meal: "🍽️ Repas", office: "📎 Bureau",
  parking: "🅿️ Parking", fuel: "⛽ Carburant", lodging: "🏨 Hébergement",
  training: "📚 Formation", other: "📦 Autre",
};

export default async function ExpensesAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin", "rh", "manager"]);
  const params = await searchParams;
  const filterStatus = params.status ?? "pending";

  const admin = createAdminClient();
  let q = admin.from("expense_reports")
    .select(`
      id, amount, expense_date, category, description, vendor, vat_amount,
      receipt_storage_path, receipt_filename, status, submitted_at, reviewed_at,
      review_note, refusal_reason, paid_at, payment_qr_data,
      employee:employees(id, full_name, iban),
      reviewer:profiles!reviewer_profile_id(full_name)
    `)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (filterStatus !== "all") q = q.eq("status", filterStatus);
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string; amount: number; expense_date: string; category: string;
    description: string | null; vendor: string | null; vat_amount: number | null;
    receipt_storage_path: string | null; receipt_filename: string | null;
    status: string; submitted_at: string; reviewed_at: string | null;
    review_note: string | null; refusal_reason: string | null;
    paid_at: string | null; payment_qr_data: string | null;
    employee?: { id: string; full_name: string; iban: string | null } | null;
    reviewer?: { full_name: string } | null;
  }>;

  const { data: countsRaw } = await admin.from("expense_reports").select("status, amount");
  const counts = new Map<string, { n: number; total: number }>();
  for (const r of countsRaw ?? []) {
    const cur = counts.get(r.status) ?? { n: 0, total: 0 };
    cur.n++; cur.total += Number(r.amount);
    counts.set(r.status, cur);
  }
  const pendingCount = counts.get("pending")?.n ?? 0;
  const pendingTotal = counts.get("pending")?.total ?? 0;
  const approvedTotal = counts.get("approved")?.total ?? 0;
  const paidTotal = counts.get("paid")?.total ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            Notes de frais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validation + paiement via virement IBAN (QR EPC SEPA).
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pendingCount} note(s) à valider — {pendingTotal.toFixed(2)} €
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { k: "pending", l: "À valider", c: pendingCount, t: pendingTotal },
          { k: "approved", l: "À payer", c: counts.get("approved")?.n ?? 0, t: approvedTotal },
          { k: "paid", l: "Payées", c: counts.get("paid")?.n ?? 0, t: paidTotal },
          { k: "refused", l: "Refusées", c: counts.get("refused")?.n ?? 0, t: 0 },
          { k: "all", l: "Toutes", c: countsRaw?.length ?? 0, t: 0 },
        ].map((f) => (
          <Link
            key={f.k}
            href={`/rh/expenses?status=${f.k}`}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold border ${
              filterStatus === f.k ? "bg-foreground text-background border-foreground" : "bg-surface border-line hover:bg-muted"
            }`}
          >
            {f.l} <span className="opacity-70">({f.c}{f.t > 0 ? ` · ${f.t.toFixed(0)}€` : ""})</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">Aucune note pour ce filtre.</Card>
      )}

      <div className="space-y-2">
        {rows.map((e) => {
          const meta = STATUS_META[e.status] ?? STATUS_META.cancelled;
          return (
            <Card key={e.id} className="p-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/planning/employees/${e.employee?.id}`} className="font-semibold text-sm hover:underline">
                      {e.employee?.full_name ?? "—"}
                    </Link>
                    <Badge className={`text-[10px] border ${meta.cls}`}>{meta.label}</Badge>
                    <span className="text-[10px] text-ink-3">{CATEGORY_LABEL[e.category] ?? e.category}</span>
                    <span className="text-[10px] text-ink-3 font-mono">{e.expense_date}</span>
                  </div>
                  {e.description && <div className="text-xs mt-1">{e.description}</div>}
                  {e.vendor && <div className="text-[10px] text-ink-3 mt-0.5">{e.vendor}</div>}
                  {e.vat_amount && <div className="text-[10px] text-ink-3">TVA : {Number(e.vat_amount).toFixed(2)} €</div>}
                  {e.review_note && (
                    <div className="text-[10px] text-blue-800 italic mt-1 bg-blue-50 p-1.5 rounded">Note : {e.review_note}</div>
                  )}
                  {e.refusal_reason && (
                    <div className="text-[10px] text-red-800 italic mt-1 bg-red-50 p-1.5 rounded">Refus : {e.refusal_reason}</div>
                  )}
                  {e.reviewer && (
                    <div className="text-[10px] text-ink-3 mt-1">Par {e.reviewer.full_name} le {e.reviewed_at && new Date(e.reviewed_at).toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" })}</div>
                  )}
                  {!e.employee?.iban && e.status === "approved" && (
                    <div className="text-[10px] text-red-700 mt-1 italic flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> IBAN employé manquant pour le paiement
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold tabular-nums">{Number(e.amount).toFixed(2)} €</div>
                  <ExpenseActionsRow
                    expenseId={e.id}
                    status={e.status}
                    hasReceipt={!!e.receipt_storage_path}
                    hasIban={!!e.employee?.iban}
                    qrData={e.payment_qr_data}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
