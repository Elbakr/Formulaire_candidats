import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { FileText, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

// Karim 2026-07-04 : dossier CONTRATS, filtrable — En cours / Échus / Tous. Chaque
// ligne ouvre le contrat (super layout figé). Aussi accessible depuis la fiche du
// travailleur (section Contrat).

type Filter = "en_cours" | "echus" | "tous";
const LABELS: Record<Filter, string> = { en_cours: "En cours", echus: "Échus", tous: "Tous" };

const STATUT_BADGE: Record<string, string> = {
  signed: "bg-emerald-100 text-emerald-800",
  ready_to_sign: "bg-amber-100 text-amber-800",
  draft: "bg-gray-100 text-gray-600",
  archived: "bg-gray-100 text-gray-500",
};

export default async function ContractsFolderPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const sp = await searchParams;
  const filter: Filter = sp.f === "echus" ? "echus" : sp.f === "tous" ? "tous" : "en_cours";
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await admin
    .from("employee_contracts")
    .select("id, employee_id, full_name, contract_kind, status, start_date, end_date, signed_at, employee:employees(full_name)")
    .order("signed_at", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: false });
  type Row = {
    id: string; employee_id: string; full_name: string | null; contract_kind: string; status: string;
    start_date: string | null; end_date: string | null; signed_at: string | null;
    employee?: { full_name: string | null } | null;
  };
  const all = (data ?? []) as unknown as Row[];

  const isEnCours = (r: Row) => r.status === "signed" && (!r.end_date || r.end_date >= today);
  const isEchu = (r: Row) => r.status === "signed" && !!r.end_date && r.end_date < today;
  const rows = filter === "tous" ? all : filter === "echus" ? all.filter(isEchu) : all.filter(isEnCours);

  const counts = {
    en_cours: all.filter(isEnCours).length,
    echus: all.filter(isEchu).length,
    tous: all.length,
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-gold-dark" />
        <h1 className="text-2xl font-bold">Contrats</h1>
      </div>

      <div className="flex gap-2">
        {(["en_cours", "echus", "tous"] as Filter[]).map((f) => (
          <Link
            key={f}
            href={`/admin/contracts?f=${f}`}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              filter === f ? "bg-ink text-white border-ink" : "border-line text-ink-2 hover:border-gold"
            }`}
          >
            {LABELS[f]} <span className="opacity-70">({counts[f]})</span>
          </Link>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-3 text-left text-xs">
              <tr>
                <th className="py-2 px-3">Travailleur</th><th className="px-3">Type</th>
                <th className="px-3">Début</th><th className="px-3">Fin</th>
                <th className="px-3">Statut</th><th className="px-3">Signé le</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="py-4 px-3 text-ink-3">Aucun contrat « {LABELS[filter]} ».</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-surface">
                  <td className="py-2 px-3 font-semibold">{r.employee?.full_name ?? r.full_name ?? "—"}</td>
                  <td className="px-3">{r.contract_kind}</td>
                  <td className="px-3 whitespace-nowrap">{r.start_date ?? "—"}</td>
                  <td className="px-3 whitespace-nowrap">{r.end_date ?? "CDI"}</td>
                  <td className="px-3"><span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${STATUT_BADGE[r.status] ?? "bg-gray-100"}`}>{r.status}</span></td>
                  <td className="px-3 whitespace-nowrap">{r.signed_at ? new Date(r.signed_at).toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" }) : "—"}</td>
                  <td className="px-3 text-right">
                    <Link href={`/planning/employees/${r.employee_id}/contract/${r.id}`} className="inline-flex items-center gap-1 text-gold-dark font-semibold hover:underline">
                      <Eye className="h-3.5 w-3.5" /> Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
