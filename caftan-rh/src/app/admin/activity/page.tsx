import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KIND_GROUPS, type ActivityRow } from "@/lib/activity";
import { ActivityFilters } from "./activity-filters";

const PAGE_SIZE = 50;

type SearchParams = {
  actor?: string;
  kind?: string;
  from?: string;
  to?: string;
  page?: string;
};

function safeDate(s: string | undefined) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

function targetLink(row: ActivityRow): string | null {
  if (!row.target_id) return null;
  switch (row.target_type) {
    case "application":
      return `/rh/candidates/${row.target_id}`;
    case "employee":
      return `/planning/employees/${row.target_id}`;
    case "shift":
      return "/planning/calendar";
    case "time_off":
      return "/planning/time-off";
    case "evaluation":
      return "/scoring";
    default:
      return null;
  }
}

export default async function AdminActivityPage(props: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "rh"]);
  const sp = await props.searchParams;

  const page = Math.max(0, parseInt(sp.page ?? "0", 10) || 0);
  const from = safeDate(sp.from);
  const to = safeDate(sp.to);

  const supabase = await createClient();

  // Build the query
  let q = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (sp.actor && sp.actor !== "all") q = q.eq("actor_id", sp.actor);
  if (sp.kind && sp.kind !== "all") q = q.eq("kind", sp.kind);
  if (from) q = q.gte("created_at", from.toISOString());
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    q = q.lte("created_at", end.toISOString());
  }

  const [{ data: rows, count }, { data: actors }] = await Promise.all([
    q,
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("role", ["admin", "rh", "manager"])
      .order("full_name"),
  ]);

  const total = count ?? 0;
  const items = (rows ?? []) as ActivityRow[];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build query string for pagination links
  const baseParams = new URLSearchParams();
  if (sp.actor && sp.actor !== "all") baseParams.set("actor", sp.actor);
  if (sp.kind && sp.kind !== "all") baseParams.set("kind", sp.kind);
  if (sp.from) baseParams.set("from", sp.from);
  if (sp.to) baseParams.set("to", sp.to);
  function pageHref(p: number) {
    const u = new URLSearchParams(baseParams);
    if (p > 0) u.set("page", String(p));
    const qs = u.toString();
    return qs ? `?${qs}` : "?";
  }

  const actorList = (actors ?? []) as { id: string; full_name: string | null; email: string }[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Journal d&apos;activité</h1>
          <p className="text-sm text-ink-2">
            Historique des actions équipe — {total} évènement{total > 1 ? "s" : ""}.
          </p>
        </div>
      </div>

      <Card className="p-3">
        <ActivityFilters
          actors={actorList}
          actorValue={sp.actor ?? "all"}
          kindValue={sp.kind ?? "all"}
          fromValue={sp.from ?? ""}
          toValue={sp.to ?? ""}
          groups={ACTIVITY_KIND_GROUPS}
        />
      </Card>

      <Card>
        {items.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-3">Aucun évènement.</div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((row) => {
              const link = targetLink(row);
              const label =
                row.actor_label ?? actorList.find((a) => a.id === row.actor_id)?.full_name ?? "Système";
              const kindLabel = ACTIVITY_KIND_LABELS[row.kind] ?? row.kind;
              return (
                <li key={row.id} className="p-3 hover:bg-surface-2 transition-colors">
                  <details className="group">
                    <summary className="flex items-center gap-3 cursor-pointer list-none">
                      <NameAvatar name={label || "??"} className="h-8 w-8 text-[10px] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">{label}</span>
                          <Badge variant="muted">{kindLabel}</Badge>
                          {row.target_type ? (
                            <span className="text-[11px] text-ink-3">cible: {row.target_type}</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-ink-2 truncate">
                          {row.description ?? <span className="text-ink-3">(pas de description)</span>}
                        </div>
                      </div>
                      <div className="text-[11px] text-ink-3 whitespace-nowrap">
                        {relativeTime(row.created_at)}
                      </div>
                    </summary>
                    <div className="mt-3 pl-11 space-y-2">
                      <div className="text-[11px] text-ink-3">
                        {new Date(row.created_at).toLocaleString("fr-BE")} ·{" "}
                        <code className="font-mono">{row.kind}</code>
                        {row.target_id ? (
                          <>
                            {" · "}
                            <code className="font-mono break-all">{row.target_id}</code>
                          </>
                        ) : null}
                      </div>
                      {link ? (
                        <Link href={link} className="text-xs text-gold-dark hover:underline">
                          Ouvrir la cible →
                        </Link>
                      ) : null}
                      {row.data ? (
                        <pre className="text-[11px] bg-surface-2 border border-line rounded p-2 overflow-x-auto max-h-[280px] whitespace-pre-wrap break-all">
                          {JSON.stringify(row.data, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-ink-3">
            Page {page + 1} / {totalPages}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page === 0}>
              <Link href={pageHref(Math.max(0, page - 1))}>
                <ChevronLeft className="h-4 w-4" /> Précédent
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page + 1 >= totalPages}>
              <Link href={pageHref(page + 1)}>
                Suivant <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
