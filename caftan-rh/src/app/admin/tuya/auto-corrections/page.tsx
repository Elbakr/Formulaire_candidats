// Karim 2026-05-26 : Page d audit RH des auto-corrections pointages.
// Liste tous les clock_entries dont les notes contiennent [AUTO-CORRECTION]
// avec confiance + raison + statut. RH peut valider, rejeter, modifier.

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Brain, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AUTO_CORRECTION_NOTE_PREFIX } from "@/lib/tuya-correction-inference";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CorrectionData = {
  confidence: number;
  reason: string;
  autoApplied: boolean;
  correctedKind: "in" | "out";
  requiresHrReview: boolean;
  timestamp: string;
};

function parseCorrection(notes: string | null): CorrectionData | null {
  if (!notes) return null;
  const idx = notes.indexOf(AUTO_CORRECTION_NOTE_PREFIX);
  if (idx < 0) return null;
  const jsonStart = notes.indexOf("{", idx);
  if (jsonStart < 0) return null;
  // Trouve la fin du JSON par comptage des accolades
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < notes.length; i++) {
    if (notes[i] === "{") depth++;
    if (notes[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  try {
    return JSON.parse(notes.slice(jsonStart, end + 1)) as CorrectionData;
  } catch {
    return null;
  }
}

export default async function AutoCorrectionsPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  // Charge les clock_entries avec [AUTO-CORRECTION] dans notes
  const { data: entriesRaw } = await supabase
    .from("clock_entries")
    .select("id, employee_id, kind, occurred_at, source, notes, site_id")
    .ilike("notes", `%${AUTO_CORRECTION_NOTE_PREFIX}%`)
    .order("occurred_at", { ascending: false })
    .limit(200);

  type Entry = {
    id: string;
    employee_id: string;
    kind: "in" | "out";
    occurred_at: string;
    source: string | null;
    notes: string | null;
    site_id: string | null;
  };
  const entries = (entriesRaw ?? []) as Entry[];

  // Enrichis avec nom employe + site
  const empIds = [...new Set(entries.map((e) => e.employee_id))];
  const siteIds = [...new Set(entries.map((e) => e.site_id).filter((x): x is string => !!x))];
  const [{ data: empsRaw }, { data: sitesRaw }] = await Promise.all([
    empIds.length ? supabase.from("employees").select("id, full_name").in("id", empIds) : { data: [] },
    siteIds.length ? supabase.from("sites").select("id, code, color").in("id", siteIds) : { data: [] },
  ]);
  const empById = new Map(((empsRaw ?? []) as Array<{ id: string; full_name: string }>).map((e) => [e.id, e]));
  const siteById = new Map(((sitesRaw ?? []) as Array<{ id: string; code: string; color: string | null }>).map((s) => [s.id, s]));

  // Parse les corrections
  const rows = entries.map((e) => ({
    entry: e,
    emp: empById.get(e.employee_id),
    site: e.site_id ? siteById.get(e.site_id) : null,
    correction: parseCorrection(e.notes),
  })).filter((r) => r.correction);

  const stats = {
    total: rows.length,
    autoApplied: rows.filter((r) => r.correction!.autoApplied).length,
    pendingReview: rows.filter((r) => r.correction!.requiresHrReview && r.correction!.confidence < 100).length,
    avgConfidence: rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.correction!.confidence, 0) / rows.length) : 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-info" />
            Auto-corrections pointage
          </h1>
          <p className="text-sm text-ink-2">
            Pointages reclassés automatiquement par l&apos;algo d&apos;inférence statistique (15j d&apos;historique). Valide ou corrige.
          </p>
        </div>
        <Link href="/admin" className="text-xs px-3 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiBox label="Total corrections" value={String(stats.total)} icon={<Brain className="h-4 w-4 text-info" />} />
        <KpiBox label="Auto-appliquées (>=85%)" value={String(stats.autoApplied)} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
        <KpiBox label="En attente validation" value={String(stats.pendingReview)} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} variant="amber" />
        <KpiBox label="Confiance moyenne" value={`${stats.avgConfidence}%`} icon={<Brain className="h-4 w-4 text-gold-dark" />} />
      </div>

      <Card>
        <div className="px-3 py-2 border-b border-line flex items-center gap-2">
          <Brain className="h-4 w-4 text-info" />
          <h2 className="font-bold text-sm">Détail des corrections (200 plus récentes)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="text-left px-2 py-1.5">Quand</th>
                <th className="text-left px-2 py-1.5">Employé</th>
                <th className="text-left px-2 py-1.5">Site</th>
                <th className="text-center px-2 py-1.5">Kind</th>
                <th className="text-center px-2 py-1.5">Confiance</th>
                <th className="text-center px-2 py-1.5">Statut</th>
                <th className="text-left px-2 py-1.5">Raison</th>
                <th className="text-center px-2 py-1.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-ink-3">
                    Aucune auto-correction enregistrée. L&apos;algo n&apos;a pas eu besoin de corriger des erreurs récemment.
                  </td>
                </tr>
              ) : rows.map((r) => {
                const cor = r.correction!;
                const localTs = new Date(new Date(r.entry.occurred_at).getTime() + 2 * 3600_000).toISOString();
                return (
                  <tr key={r.entry.id} className="border-b border-line hover:bg-surface-2/40">
                    <td className="px-2 py-1.5 font-mono text-[11px]">{localTs.slice(0, 10)} <span className="text-ink-3">{localTs.slice(11, 16)}</span></td>
                    <td className="px-2 py-1.5">
                      <Link href={`/planning/employees/${r.entry.employee_id}/prestations?view=day&date=${localTs.slice(0, 10)}`} className="text-blue-700 font-bold hover:underline">
                        {r.emp?.full_name ?? "?"}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      {r.site ? (
                        <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded text-white font-bold text-[10px]" style={{ backgroundColor: r.site.color ?? "#666" }}>
                          {r.site.code}
                        </span>
                      ) : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${r.entry.kind === "in" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {r.entry.kind.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`font-bold tabular-nums ${cor.confidence >= 85 ? "text-success" : cor.confidence >= 70 ? "text-amber-600" : "text-danger"}`}>
                        {cor.confidence}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {cor.autoApplied ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success">
                          <CheckCircle2 className="h-3 w-3" /> Auto
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> A valider
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-ink-2 max-w-[400px]">
                      {cor.reason}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link
                        href={`/planning/employees/${r.entry.employee_id}/prestations?view=day&date=${localTs.slice(0, 10)}`}
                        className="text-[10px] px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2 font-bold"
                      >
                        Voir / Corriger
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-[11px] text-ink-3 italic px-2">
        Note : Confiance &gt;=85% → auto-appliqué (corrigé direct). 70-84% → flag pour validation. &lt;70% → garde original + alerte forte.
        L&apos;algo apprend des corrections RH validées (manual_admin) pour améliorer ses prochaines déductions.
      </div>
    </div>
  );
}

function KpiBox({ label, value, icon, variant }: { label: string; value: string; icon: React.ReactNode; variant?: "amber" }) {
  return (
    <Card className={variant === "amber" ? "border-amber-300 bg-amber-50/30" : ""}>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-ink-3">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      </div>
    </Card>
  );
}
