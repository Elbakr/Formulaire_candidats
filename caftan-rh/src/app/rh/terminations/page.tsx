// Karim 2026-06-02 : dashboard centralise des ruptures amiables. Affiche
// toutes les demandes pending/approved/sent_for_signature, avec filtres
// statut et actions rapides (voir fiche / approuver / refuser).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSignature, AlertTriangle, Clock, Check, XCircle } from "lucide-react";
import { TerminationsFilters } from "./filters";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending_admin: { label: "Demande worker", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  approved: { label: "Approuvée (envoi attendu)", cls: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  sent_for_signature: { label: "Envoyée pour signature", cls: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: FileSignature },
  signed_employee: { label: "Signée par employé", cls: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: Check },
  signed_employer: { label: "Signée par employeur", cls: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: Check },
  fully_signed: { label: "Pleinement signée", cls: "bg-green-100 text-green-800 border-green-200", icon: Check },
  executed: { label: "Exécutée", cls: "bg-green-100 text-green-800 border-green-200", icon: Check },
  refused: { label: "Refusée", cls: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  cancelled: { label: "Annulée", cls: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

export default async function TerminationsDashboardPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin", "rh"]);
  const params = await searchParams;
  const filterStatus = params.status ?? "active";

  const admin = createAdminClient();
  let q = admin
    .from("contract_terminations")
    .select(`
      id, status, initiated_by, requested_at, earliest_effective_date,
      effective_date, employer_representative_name, request_note, approval_note,
      refusal_reason, employee:employees(id, full_name, email, job_title)
    `)
    .order("requested_at", { ascending: false })
    .limit(200);

  if (filterStatus === "active") {
    q = q.in("status", ["pending_admin", "approved", "sent_for_signature", "signed_employee", "signed_employer"]);
  } else if (filterStatus === "pending") {
    q = q.eq("status", "pending_admin");
  } else if (filterStatus === "signed") {
    q = q.in("status", ["fully_signed", "executed"]);
  } else if (filterStatus === "closed") {
    q = q.in("status", ["refused", "cancelled"]);
  } else if (filterStatus !== "all") {
    q = q.eq("status", filterStatus);
  }

  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    initiated_by: string;
    requested_at: string;
    earliest_effective_date: string;
    effective_date: string | null;
    employer_representative_name: string | null;
    request_note: string | null;
    approval_note: string | null;
    refusal_reason: string | null;
    employee?: { id: string; full_name: string; email: string | null; job_title: string | null } | null;
  }>;

  // Counts par status pour les pills
  const { data: countsRaw } = await admin
    .from("contract_terminations")
    .select("status");
  const counts = new Map<string, number>();
  for (const r of countsRaw ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const pendingCount = counts.get("pending_admin") ?? 0;
  const activeCount = ["pending_admin", "approved", "sent_for_signature", "signed_employee", "signed_employer"]
    .reduce((s, st) => s + (counts.get(st) ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="w-6 h-6" />
            Ruptures amiables
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toutes les conventions de cessation de contrat de commun accord.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pendingCount} demande{pendingCount > 1 ? "s" : ""} worker à valider
          </div>
        )}
      </div>

      <TerminationsFilters
        current={filterStatus}
        counts={{
          active: activeCount,
          pending: pendingCount,
          signed: (counts.get("fully_signed") ?? 0) + (counts.get("executed") ?? 0),
          closed: (counts.get("refused") ?? 0) + (counts.get("cancelled") ?? 0),
          all: countsRaw?.length ?? 0,
        }}
      />

      {rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucune rupture correspondant à ce filtre.
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((t) => {
          const meta = STATUS_META[t.status] ?? STATUS_META.cancelled;
          const StatusIcon = meta.icon;
          const isUrgent = t.status === "pending_admin" && t.initiated_by === "employee";
          return (
            <Card key={t.id} className={`p-4 ${isUrgent ? "border-amber-300 bg-amber-50/30" : ""}`}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/planning/employees/${t.employee?.id}`} className="font-semibold text-sm hover:underline truncate">
                      {t.employee?.full_name ?? "—"}
                    </Link>
                    <Badge className={`text-[10px] border ${meta.cls}`}>
                      <StatusIcon className="w-3 h-3 mr-1 inline" />
                      {meta.label}
                    </Badge>
                    {t.initiated_by === "employee" && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-800">Initiée worker</Badge>
                    )}
                  </div>
                  <div className="text-xs text-ink-3 mt-1 space-y-0.5">
                    <div>
                      <span className="font-medium text-ink-2">Demandé :</span>{" "}
                      {new Date(t.requested_at).toLocaleString("fr-BE", { dateStyle: "long", timeStyle: "short" })}
                    </div>
                    {t.effective_date && (
                      <div>
                        <span className="font-medium text-ink-2">Date de fin :</span>{" "}
                        <strong>{new Date(t.effective_date).toLocaleDateString("fr-BE", { dateStyle: "long" })}</strong>
                      </div>
                    )}
                    {t.initiated_by === "employee" && t.status === "pending_admin" && (
                      <div className="text-amber-700">
                        <span className="font-medium">Date min. autorisée :</span> {t.earliest_effective_date} (cooling-off 3j)
                      </div>
                    )}
                    {t.employer_representative_name && (
                      <div>
                        <span className="font-medium text-ink-2">Représentant :</span> {t.employer_representative_name}
                      </div>
                    )}
                    {t.employee?.job_title && (
                      <div className="text-ink-3">{t.employee.job_title}</div>
                    )}
                  </div>
                  {t.request_note && (
                    <div className="mt-2 bg-purple-50 border border-purple-200 rounded p-2 text-xs">
                      <div className="font-semibold text-[10px] text-purple-700 mb-0.5">Motif worker :</div>
                      <div className="italic">{t.request_note}</div>
                    </div>
                  )}
                  {t.approval_note && (
                    <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                      <div className="font-semibold text-[10px] text-blue-700 mb-0.5">Note RH :</div>
                      <div>{t.approval_note}</div>
                    </div>
                  )}
                  {t.refusal_reason && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800">
                      <div className="font-semibold text-[10px] mb-0.5">Raison du refus :</div>
                      <div>{t.refusal_reason}</div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <Link
                    href={`/planning/employees/${t.employee?.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-foreground text-background font-semibold hover:opacity-90"
                  >
                    {isUrgent ? "Valider la demande" : "Voir fiche"}
                  </Link>
                  {(t.status === "approved" || t.status === "sent_for_signature") && (
                    <Link
                      href={`/api/terminations/${t.id}/letter`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border border-line hover:bg-muted"
                    >
                      Aperçu PDF
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
