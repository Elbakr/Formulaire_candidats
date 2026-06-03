// Karim 2026-06-03 : page worker notes de frais.

import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "Approuvée — paiement à venir", cls: "bg-blue-100 text-blue-900" },
  paid: { label: "Payée ✓", cls: "bg-green-100 text-green-900" },
  refused: { label: "Refusée", cls: "bg-red-100 text-red-900" },
  cancelled: { label: "Annulée", cls: "bg-gray-100 text-gray-700" },
};

const CATEGORY_LABEL: Record<string, string> = {
  transport: "🚇 Transport",
  meal: "🍽️ Repas",
  office: "📎 Bureau",
  parking: "🅿️ Parking",
  fuel: "⛽ Carburant",
  lodging: "🏨 Hébergement",
  training: "📚 Formation",
  other: "📦 Autre",
};

export default async function MyExpensesPage() {
  await requireUser();
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, full_name").eq("profile_id", user.id).maybeSingle();
  if (!emp) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Notes de frais</h1>
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Aucune fiche employé liée à ton compte.
        </Card>
      </div>
    );
  }

  const empData = emp as { id: string; full_name: string };
  const { data: expenses } = await admin.from("expense_reports")
    .select("id, amount, expense_date, category, description, vendor, status, submitted_at, review_note, refusal_reason, paid_at")
    .eq("employee_id", empData.id)
    .order("submitted_at", { ascending: false })
    .limit(50);
  const list = (expenses ?? []) as Array<{
    id: string; amount: number; expense_date: string; category: string; description: string | null;
    vendor: string | null; status: string; submitted_at: string; review_note: string | null;
    refusal_reason: string | null; paid_at: string | null;
  }>;

  const pending = list.filter((e) => e.status === "pending");
  const approved = list.filter((e) => e.status === "approved");
  const paid = list.filter((e) => e.status === "paid");
  const totalPending = pending.reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = approved.reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid = paid.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="w-6 h-6" />
          Mes notes de frais
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Soumets une dépense avec photo du justificatif. Validation RH puis remboursement par virement.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-ink-3">En attente</div>
          <div className="text-xl font-bold text-amber-700">{totalPending.toFixed(2)} €</div>
          <div className="text-[10px] text-ink-3">{pending.length} note(s)</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-ink-3">Approuvées</div>
          <div className="text-xl font-bold text-blue-700">{totalApproved.toFixed(2)} €</div>
          <div className="text-[10px] text-ink-3">{approved.length} note(s)</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-ink-3">Payées</div>
          <div className="text-xl font-bold text-green-700">{totalPaid.toFixed(2)} €</div>
          <div className="text-[10px] text-ink-3">{paid.length} note(s)</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-sm">Nouvelle note de frais</h2>
        </div>
        <ExpenseForm />
      </Card>

      {list.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Aucune note de frais.</Card>
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const meta = STATUS_META[e.status] ?? STATUS_META.cancelled;
            return (
              <Card key={e.id} className="p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{CATEGORY_LABEL[e.category] ?? e.category}</span>
                      <Badge className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                      <span className="text-[10px] text-ink-3 font-mono">{e.expense_date}</span>
                    </div>
                    {e.description && <div className="text-xs text-ink-2 mt-1">{e.description}</div>}
                    {e.vendor && <div className="text-[10px] text-ink-3 mt-0.5">{e.vendor}</div>}
                    {e.review_note && (
                      <div className="text-[10px] text-blue-800 italic mt-1 bg-blue-50 p-1.5 rounded">RH : {e.review_note}</div>
                    )}
                    {e.refusal_reason && (
                      <div className="text-[10px] text-red-800 italic mt-1 bg-red-50 p-1.5 rounded">Refus : {e.refusal_reason}</div>
                    )}
                    {e.paid_at && (
                      <div className="text-[10px] text-green-700 mt-1">✓ Payé le {new Date(e.paid_at).toLocaleDateString("fr-BE")}</div>
                    )}
                  </div>
                  <div className="text-lg font-bold tabular-nums">{Number(e.amount).toFixed(2)} €</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
