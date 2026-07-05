// Karim 2026-06-03 : dashboard centralisé Dimona (à déclarer / déclarées).
// Lien direct vers portail ONSS + bouton "Marquer déclarée" qui sauvegarde
// l'état après que l'admin ait fait la déclaration manuelle.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle2, ExternalLink, XCircle, Clock } from "lucide-react";
import { DimonaActionsRow } from "./actions-row";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "À déclarer", cls: "bg-amber-100 text-amber-900 border-amber-300", icon: AlertTriangle },
  declared_onss: { label: "Déclarée", cls: "bg-green-100 text-green-900 border-green-300", icon: CheckCircle2 },
  confirmed: { label: "Confirmée ONSS", cls: "bg-emerald-100 text-emerald-900 border-emerald-300", icon: CheckCircle2 },
  rejected: { label: "Rejetée", cls: "bg-red-100 text-red-900 border-red-300", icon: XCircle },
  cancelled: { label: "Annulée", cls: "bg-gray-100 text-gray-800 border-gray-300", icon: XCircle },
  // Alias de sécurité (anciennes valeurs éventuelles) :
  declared: { label: "Déclarée", cls: "bg-green-100 text-green-900 border-green-300", icon: CheckCircle2 },
  failed: { label: "Échec", cls: "bg-red-100 text-red-900 border-red-300", icon: XCircle },
};

export default async function DimonaDashboardPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin", "rh"]);
  const params = await searchParams;
  const filterStatus = params.status ?? "pending";

  const admin = createAdminClient();
  let q = admin
    .from("dimona_declarations")
    .select(`
      id, declaration_kind, employer_org_key, start_date, end_date,
      worker_type, status, declared_at, dimona_period_id, notes, created_at,
      employee:employees(id, full_name, nrn, birth_date, email),
      declarer:profiles!declared_by(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(300);
  if (filterStatus !== "all") q = q.eq("status", filterStatus);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    declaration_kind: string;
    employer_org_key: string | null;
    start_date: string | null;
    end_date: string | null;
    worker_type: string;
    status: string;
    declared_at: string | null;
    dimona_period_id: string | null;
    notes: string | null;
    created_at: string;
    employee?: { id: string; full_name: string; nrn: string | null; birth_date: string | null; email: string | null } | null;
    declarer?: { full_name: string } | null;
  }>;

  // Counts
  const { data: countsRaw } = await admin.from("dimona_declarations").select("status, declaration_kind");
  const counts = new Map<string, number>();
  for (const r of countsRaw ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const pendingIn = (countsRaw ?? []).filter((r) => r.status === "pending" && r.declaration_kind === "IN").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Déclarations Dimona ONSS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            IN avant 1er jour de travail, OUT au plus tard 1 jour ouvrable avant fin de contrat.
            <a
              href="https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline ml-2 inline-flex items-center gap-1"
            >
              Portail ONSS <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
        {pendingIn > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full text-xs font-bold text-red-900">
            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
            🚨 {pendingIn} Dimona IN à déclarer (sanctions ONSS si manquées)
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { k: "pending", l: "À déclarer", c: counts.get("pending") ?? 0 },
          { k: "declared_onss", l: "Déclarées", c: counts.get("declared_onss") ?? 0 },
          { k: "confirmed", l: "Confirmées", c: counts.get("confirmed") ?? 0 },
          { k: "cancelled", l: "Annulées", c: counts.get("cancelled") ?? 0 },
          { k: "all", l: "Toutes", c: countsRaw?.length ?? 0 },
        ].map((f) => (
          <Link
            key={f.k}
            href={`/rh/dimona?status=${f.k}`}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold border ${
              filterStatus === f.k ? "bg-foreground text-background border-foreground" : "bg-surface border-line hover:bg-muted"
            }`}
          >
            {f.l} <span className="opacity-70">({f.c})</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucune déclaration pour ce filtre.
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((d) => {
          const meta = STATUS_META[d.status] ?? STATUS_META.cancelled;
          const Icon = meta.icon;
          const isInDanger = d.status === "pending" && d.declaration_kind === "IN";
          return (
            <Card key={d.id} className={`p-4 ${isInDanger ? "border-red-300 bg-red-50/30" : ""}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/planning/employees/${d.employee?.id}`} className="font-semibold text-sm hover:underline">
                      {d.employee?.full_name ?? "—"}
                    </Link>
                    <Badge className={`text-[10px] uppercase font-bold ${d.declaration_kind === "IN" ? "bg-blue-100 text-blue-900" : "bg-purple-100 text-purple-900"}`}>
                      Dimona {d.declaration_kind}
                    </Badge>
                    <Badge className={`text-[10px] border ${meta.cls}`}>
                      <Icon className="w-3 h-3 mr-1 inline" />
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-ink-3">{d.employer_org_key}</span>
                  </div>
                  <div className="text-xs text-ink-3 mt-1 space-y-0.5">
                    {d.start_date && (
                      <div>📅 Date <strong>{d.declaration_kind === "IN" ? "entrée" : "fin"}</strong> : <span className="font-mono">{d.start_date}</span>
                        {d.declaration_kind === "IN" && d.end_date && <span> → fin prévue : {d.end_date}</span>}
                      </div>
                    )}
                    {d.employee?.nrn && <div>NRN : <span className="font-mono">{d.employee.nrn}</span></div>}
                    {d.employee?.birth_date && <div>Né(e) le : {d.employee.birth_date}</div>}
                    {d.declared_at && d.declarer && (
                      <div className="text-green-700">
                        ✓ Déclarée le {new Date(d.declared_at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })} par <strong>{d.declarer.full_name}</strong>
                      </div>
                    )}
                    {d.dimona_period_id && (
                      <div>🔢 Period ID : <span className="font-mono">{d.dimona_period_id}</span></div>
                    )}
                    {d.notes && (
                      <div className="italic mt-1">{d.notes}</div>
                    )}
                  </div>
                </div>
                <DimonaActionsRow declarationId={d.id} status={d.status} kind={d.declaration_kind} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
