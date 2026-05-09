// Inbox d'actions IA — la liste centrale d'actions proposées par les agents,
// en attente de validation humaine. Ordre : pending d'abord, plus récents en haut.

import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Inbox as InboxIcon, Mail, FileText, Tag, UserCheck, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InboxFilters } from "./inbox-filters";

const PAGE_SIZE = 50;

type AgentActionRow = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  target_type: string | null;
  target_id: string | null;
  proposed_by_agent: string | null;
  ai_confidence: number | null;
  proposed_at: string;
  expires_at: string | null;
};

type SearchParams = {
  kind?: string;
  target_type?: string;
  from?: string;
  to?: string;
  page?: string;
  status?: string;
};

const KIND_LABELS: Record<string, string> = {
  reply_draft: "Brouillon de réponse",
  status_change: "Changement de statut",
  send_template: "Envoi template",
  assign_manager: "Affectation manager",
  doc_classify: "Classification document",
  candidate_scoring: "Scoring candidat",
  spam_archive: "Archivage spam",
  follow_up: "Relance",
  scheduling_proposal: "Proposition de créneaux",
};

const KIND_ICONS: Record<string, typeof Mail> = {
  reply_draft: Mail,
  status_change: Tag,
  send_template: Mail,
  assign_manager: UserCheck,
  doc_classify: FileText,
  candidate_scoring: UserCheck,
  spam_archive: AlertTriangle,
  follow_up: Mail,
  scheduling_proposal: CalendarClock,
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

function confidenceBadge(c: number | null): { label: string; cls: string } {
  if (c === null || c === undefined) return { label: "?", cls: "bg-surface-2 text-ink-2" };
  if (c >= 0.85) return { label: `${Math.round(c * 100)}%`, cls: "bg-success-light text-success" };
  if (c >= 0.6) return { label: `${Math.round(c * 100)}%`, cls: "bg-warn-light text-warn" };
  return { label: `${Math.round(c * 100)}%`, cls: "bg-danger-light text-danger" };
}

function headlineFor(row: AgentActionRow, targetLabel: string | null): string {
  const target = targetLabel ?? row.target_id ?? "?";
  switch (row.kind) {
    case "reply_draft":
      return `Brouillon de réponse pour ${target}`;
    case "status_change": {
      const next = (row.payload?.next_status as string) ?? "?";
      return `Passer ${target} à "${next}"`;
    }
    case "send_template": {
      const slug = (row.payload?.template_slug as string) ?? "?";
      return `Envoyer "${slug}" à ${target}`;
    }
    case "assign_manager":
      return `Assigner un manager à ${target}`;
    case "doc_classify":
      return `Classifier un document de ${target}`;
    case "candidate_scoring":
      return `Score IA pour ${target}`;
    case "spam_archive":
      return `Archiver email de ${target} (spam)`;
    case "follow_up":
      return `Relancer ${target}`;
    case "scheduling_proposal":
      return `3 créneaux d'entretien proposés pour ${target}`;
    default:
      return `${KIND_LABELS[row.kind] ?? row.kind} · ${target}`;
  }
}

async function fetchTargetLabels(rows: AgentActionRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (rows.length === 0) return labels;
  const supabase = await createClient();

  const appIds = rows.filter((r) => r.target_type === "application" && r.target_id).map((r) => r.target_id as string);
  const candIds = rows.filter((r) => r.target_type === "candidate" && r.target_id).map((r) => r.target_id as string);
  const empIds = rows.filter((r) => r.target_type === "employee" && r.target_id).map((r) => r.target_id as string);

  if (appIds.length > 0) {
    const { data } = await supabase
      .from("applications")
      .select("id, candidate:candidates(full_name)")
      .in("id", appIds);
    (data ?? []).forEach((row) => {
      const cand = (row.candidate as unknown as { full_name?: string }) ?? null;
      if (cand?.full_name) labels.set(`application:${row.id}`, cand.full_name);
    });
  }
  if (candIds.length > 0) {
    const { data } = await supabase.from("candidates").select("id, full_name").in("id", candIds);
    (data ?? []).forEach((row) => {
      if (row.full_name) labels.set(`candidate:${row.id}`, row.full_name);
    });
  }
  if (empIds.length > 0) {
    const { data } = await supabase.from("employees").select("id, full_name").in("id", empIds);
    (data ?? []).forEach((row) => {
      if (row.full_name) labels.set(`employee:${row.id}`, row.full_name);
    });
  }
  return labels;
}

export default async function RhInboxPage(props: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await props.searchParams;

  const page = Math.max(0, parseInt(sp.page ?? "0", 10) || 0);
  const status = sp.status ?? "proposed";

  const supabase = await createClient();

  let q = supabase
    .from("agent_actions")
    .select("*", { count: "exact" })
    .order("proposed_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (status && status !== "all") q = q.eq("status", status);
  if (sp.kind && sp.kind !== "all") q = q.eq("kind", sp.kind);
  if (sp.target_type && sp.target_type !== "all") q = q.eq("target_type", sp.target_type);
  const from = safeDate(sp.from);
  const to = safeDate(sp.to);
  if (from) q = q.gte("proposed_at", from.toISOString());
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    q = q.lte("proposed_at", end.toISOString());
  }

  const { data, count } = await q;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = (data ?? []) as AgentActionRow[];

  const labels = await fetchTargetLabels(rows);

  // Build query string for pagination links
  const baseParams = new URLSearchParams();
  if (sp.kind && sp.kind !== "all") baseParams.set("kind", sp.kind);
  if (sp.target_type && sp.target_type !== "all") baseParams.set("target_type", sp.target_type);
  if (sp.from) baseParams.set("from", sp.from);
  if (sp.to) baseParams.set("to", sp.to);
  if (status && status !== "proposed") baseParams.set("status", status);
  function pageHref(p: number) {
    const u = new URLSearchParams(baseParams);
    if (p > 0) u.set("page", String(p));
    const qs = u.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Inbox d&apos;actions IA</h1>
          <p className="text-sm text-ink-2">
            {total} action{total > 1 ? "s" : ""} {status === "proposed" ? "à valider" : status}.
          </p>
        </div>
      </div>

      <Card className="p-3">
        <InboxFilters
          status={status}
          kind={sp.kind ?? "all"}
          targetType={sp.target_type ?? "all"}
          fromValue={sp.from ?? ""}
          toValue={sp.to ?? ""}
        />
      </Card>

      <Card>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-ink-3">
            <InboxIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Tout est traité.</p>
            <p className="text-xs mt-1">Aucune action en attente.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const Icon = KIND_ICONS[row.kind] ?? Mail;
              const targetKey = `${row.target_type ?? ""}:${row.target_id ?? ""}`;
              const targetLabel = labels.get(targetKey) ?? null;
              const conf = confidenceBadge(row.ai_confidence);
              return (
                <li key={row.id}>
                  <Link
                    href={`/rh/inbox/${row.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm truncate">
                          {headlineFor(row, targetLabel)}
                        </span>
                        <Badge variant="muted">{KIND_LABELS[row.kind] ?? row.kind}</Badge>
                        {row.proposed_by_agent ? (
                          <span className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                            agent: {row.proposed_by_agent}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-ink-3 truncate">
                        {row.target_type ?? "—"} · {row.target_id ?? "?"}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${conf.cls}`}
                      title="Confiance IA"
                    >
                      {conf.label}
                    </span>
                    <div className="text-[11px] text-ink-3 whitespace-nowrap">
                      {relativeTime(row.proposed_at)}
                    </div>
                  </Link>
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
