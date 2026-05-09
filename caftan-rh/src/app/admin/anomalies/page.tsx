// Admin > Anomalies dashboard.
//
// Tabs : Ouvertes (resolved_at IS NULL) / Résolues / Toutes
// Filters : severity, kind, target_type
// Each row : sévérité badge, kind label, target name, title, age, actions.
// Real-time : refreshes when anomaly_flags changes.

import Link from "next/link";
import { AlertTriangle, Info, AlertCircle, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { anomalyKindLabel } from "@/lib/anomaly/detect";
import { AnomaliesFilters } from "./anomalies-filters";
import { AnomaliesRealtime } from "./anomalies-list";
import { resolveAnomalyFormAction } from "./actions";

const PAGE_SIZE = 100;

type Tab = "open" | "resolved" | "all";

type AnomalyRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  target_type: string;
  target_id: string | null;
  title: string;
  description: string | null;
  data: Record<string, unknown> | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_reason: string | null;
  detected_at: string;
};

type SearchParams = {
  tab?: string;
  severity?: string;
  kind?: string;
  target_type?: string;
  error?: string;
};

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

function severityChip(s: AnomalyRow["severity"]) {
  switch (s) {
    case "critical":
      return { label: "Critique", cls: "bg-danger-light text-danger", Icon: AlertCircle };
    case "warning":
      return { label: "Warning", cls: "bg-warn-light text-warn", Icon: AlertTriangle };
    case "info":
    default:
      return { label: "Info", cls: "bg-info-light text-info", Icon: Info };
  }
}

async function fetchTargetLabels(rows: AnomalyRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (rows.length === 0) return labels;
  const supabase = await createClient();

  const empIds = rows.filter((r) => r.target_type === "employee" && r.target_id).map((r) => r.target_id as string);
  const appIds = rows.filter((r) => r.target_type === "application" && r.target_id).map((r) => r.target_id as string);

  if (empIds.length > 0) {
    const { data } = await supabase.from("employees").select("id, full_name").in("id", empIds);
    for (const r of (data ?? []) as Array<{ id: string; full_name: string }>) {
      labels.set(`employee:${r.id}`, r.full_name);
    }
  }
  if (appIds.length > 0) {
    const { data } = await supabase
      .from("applications")
      .select("id, candidate:candidates(full_name)")
      .in("id", appIds);
    for (const r of (data ?? []) as Array<{ id: string; candidate: { full_name?: string } | null }>) {
      const n = r.candidate?.full_name;
      if (n) labels.set(`application:${r.id}`, n);
    }
  }
  return labels;
}

export default async function AdminAnomaliesPage(props: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "rh"]);
  const sp = await props.searchParams;
  const tab: Tab = sp.tab === "resolved" ? "resolved" : sp.tab === "all" ? "all" : "open";

  const supabase = await createClient();

  let q = supabase
    .from("anomaly_flags")
    .select("*", { count: "exact" })
    .order("severity", { ascending: false }) // critical > warning > info (alphabetical happens to match)
    .order("detected_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (tab === "open") q = q.is("resolved_at", null);
  if (tab === "resolved") q = q.not("resolved_at", "is", null);

  if (sp.severity && sp.severity !== "all") q = q.eq("severity", sp.severity);
  if (sp.kind && sp.kind !== "all") q = q.eq("kind", sp.kind);
  if (sp.target_type && sp.target_type !== "all") q = q.eq("target_type", sp.target_type);

  const { data, count } = await q;
  const rows = ((data ?? []) as AnomalyRow[]).sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 } as const;
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
  });

  const labels = await fetchTargetLabels(rows);

  const tabHref = (t: Tab) => {
    const u = new URLSearchParams();
    if (sp.severity && sp.severity !== "all") u.set("severity", sp.severity);
    if (sp.kind && sp.kind !== "all") u.set("kind", sp.kind);
    if (sp.target_type && sp.target_type !== "all") u.set("target_type", sp.target_type);
    if (t !== "open") u.set("tab", t);
    const qs = u.toString();
    return qs ? `?${qs}` : "?";
  };

  // Banner stats : open critical / open warning
  const [{ count: openCritical }, { count: openWarning }] = await Promise.all([
    supabase
      .from("anomaly_flags")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .eq("severity", "critical"),
    supabase
      .from("anomaly_flags")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .eq("severity", "warning"),
  ]);

  return (
    <div className="space-y-4">
      <AnomaliesRealtime />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Anomalies</h1>
          <p className="text-sm text-ink-2">
            Scan quotidien automatique. {openCritical ?? 0} critique(s), {openWarning ?? 0} warning(s) ouverte(s).
          </p>
        </div>
      </div>

      {sp.error ? (
        <div className="rounded-md border border-danger-light bg-danger-light/40 p-3 text-xs text-danger">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="open" asChild>
            <Link href={tabHref("open")}>Ouvertes</Link>
          </TabsTrigger>
          <TabsTrigger value="resolved" asChild>
            <Link href={tabHref("resolved")}>Résolues</Link>
          </TabsTrigger>
          <TabsTrigger value="all" asChild>
            <Link href={tabHref("all")}>Toutes</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-3">
        <AnomaliesFilters
          severity={sp.severity ?? "all"}
          kind={sp.kind ?? "all"}
          targetType={sp.target_type ?? "all"}
        />
      </Card>

      <Card>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-ink-3">
            <Info className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {tab === "open"
                ? "Aucune anomalie ouverte."
                : tab === "resolved"
                  ? "Aucune anomalie résolue."
                  : "Aucune anomalie sur la période."}
            </p>
            <p className="text-xs mt-1">{count ?? 0} au total.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const sev = severityChip(row.severity);
              const SevIcon = sev.Icon;
              const targetKey = `${row.target_type}:${row.target_id ?? ""}`;
              const targetLabel = labels.get(targetKey) ?? row.target_id ?? "—";
              const detailHref = row.target_type === "employee" && row.target_id
                ? `/planning/employees/${row.target_id}`
                : row.target_type === "application" && row.target_id
                  ? `/rh/candidates/${row.target_id}`
                  : null;
              return (
                <li key={row.id} className="p-3 flex items-start gap-3">
                  <div
                    className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${sev.cls}`}
                  >
                    <SevIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${sev.cls}`}
                      >
                        {sev.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                        {anomalyKindLabel(row.kind)}
                      </span>
                      <span className="text-[10px] text-ink-3">{relativeTime(row.detected_at)}</span>
                      {row.resolved_at ? (
                        <span className="text-[10px] rounded-full bg-success-light text-success px-2 py-0.5 font-bold">
                          Résolu {relativeTime(row.resolved_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-bold text-sm mt-0.5 truncate">{row.title}</div>
                    {row.description ? (
                      <div className="text-xs text-ink-2 mt-0.5">{row.description}</div>
                    ) : null}
                    <div className="text-[11px] text-ink-3 mt-1">
                      {row.target_type} · {targetLabel}
                      {row.resolved_reason ? ` · résolution : ${row.resolved_reason}` : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {detailHref ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={detailHref}>
                          Voir <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    ) : null}
                    {!row.resolved_at ? (
                      <form action={resolveAnomalyFormAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" variant="success" size="sm">
                          Marquer résolu
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
