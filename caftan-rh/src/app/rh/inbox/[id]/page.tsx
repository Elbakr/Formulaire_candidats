// Detail view of a single agent_action.
//
// Renders the payload contextually :
//   - reply_draft : 3 brouillons, choix radio + Approuver/Rejeter
//   - status_change : avant/après + Approuver/Rejeter
//   - candidate_scoring : score + forces/lacunes
//   - generic : pretty JSON + Approuver/Rejeter

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveAndRedirectAction, rejectAndRedirectAction } from "../actions";

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
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
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
};

async function fetchTargetSummary(targetType: string | null, targetId: string | null) {
  if (!targetType || !targetId) return null;
  const supabase = await createClient();
  if (targetType === "application") {
    const { data } = await supabase
      .from("applications")
      .select("id, status, candidate:candidates(id, full_name, email), job:jobs(id, title)")
      .eq("id", targetId)
      .maybeSingle();
    return data ? { type: "application" as const, data } : null;
  }
  if (targetType === "candidate") {
    const { data } = await supabase
      .from("candidates")
      .select("id, full_name, email, phone, city")
      .eq("id", targetId)
      .maybeSingle();
    return data ? { type: "candidate" as const, data } : null;
  }
  if (targetType === "employee") {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, email")
      .eq("id", targetId)
      .maybeSingle();
    return data ? { type: "employee" as const, data } : null;
  }
  return null;
}

export default async function InboxDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const row = data as AgentActionRow;

  const target = await fetchTargetSummary(row.target_type, row.target_id);
  const editable = row.status === "proposed";

  const drafts =
    row.kind === "reply_draft"
      ? ((row.payload?.drafts as Array<{ tone: string; subject: string; body_html: string }>) ?? [])
      : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/rh/inbox">
            <ChevronLeft className="h-3 w-3" /> Retour à l&apos;inbox
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{KIND_LABELS[row.kind] ?? row.kind}</h1>
          <p className="text-sm text-ink-2">
            Proposée le {new Date(row.proposed_at).toLocaleString("fr-BE")}
            {row.proposed_by_agent ? ` · agent : ${row.proposed_by_agent}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={row.status === "proposed" ? "muted" : "gold"}>{row.status}</Badge>
          {row.ai_confidence !== null && row.ai_confidence !== undefined ? (
            <span className="text-[11px] text-ink-3">
              confiance : <strong>{Math.round(Number(row.ai_confidence) * 100)}%</strong>
            </span>
          ) : null}
        </div>
      </div>

      {sp.error ? (
        <div className="rounded-md border border-danger-light bg-danger-light/40 p-3 text-xs text-danger">
          Erreur : {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      {target ? (
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-2">
            Cible : {target.type}
          </div>
          {target.type === "application" ? (
            <div className="space-y-1">
              <div className="font-bold">
                {(target.data as { candidate?: { full_name?: string } }).candidate?.full_name ?? "?"}
              </div>
              <div className="text-xs text-ink-3">
                {(target.data as { job?: { title?: string } }).job?.title ?? "Spontanée"} ·{" "}
                {(target.data as { status?: string }).status ?? "?"}
              </div>
              <Link
                href={`/rh/candidates/${row.target_id}`}
                className="text-xs text-gold-dark hover:underline"
              >
                Ouvrir la fiche →
              </Link>
            </div>
          ) : null}
          {target.type === "candidate" ? (
            <div className="space-y-1">
              <div className="font-bold">{(target.data as { full_name?: string }).full_name}</div>
              <div className="text-xs text-ink-3">
                {(target.data as { email?: string }).email} ·{" "}
                {(target.data as { city?: string }).city ?? "—"}
              </div>
            </div>
          ) : null}
          {target.type === "employee" ? (
            <div className="space-y-1">
              <div className="font-bold">{(target.data as { full_name?: string }).full_name}</div>
              <div className="text-xs text-ink-3">{(target.data as { email?: string }).email}</div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Body : varies by kind */}
      {row.kind === "reply_draft" ? (
        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold">Brouillons générés</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Choisis un brouillon puis clique <strong>Approuver</strong>. L&apos;envoi se fera depuis la
              fiche candidat avec ton flux EmailJS habituel.
            </p>
          </div>
          {drafts.length === 0 ? (
            <div className="p-6 text-sm text-ink-3 text-center">Aucun brouillon dans le payload.</div>
          ) : (
            <form action={approveAndRedirectAction} className="p-4 space-y-3">
              <input type="hidden" name="id" value={row.id} />
              {drafts.map((d, idx) => (
                <label
                  key={idx}
                  className="block rounded-md border border-line p-3 hover:border-gold cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="draft_index"
                      value={idx}
                      defaultChecked={idx === 0}
                      disabled={!editable}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gold-dark">
                          {d.tone}
                        </span>
                        <span className="font-bold text-sm truncate">{d.subject}</span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="mt-2 prose prose-sm max-w-none text-xs"
                    dangerouslySetInnerHTML={{ __html: d.body_html }}
                  />
                </label>
              ))}
              {editable ? (
                <div className="flex gap-2 pt-2">
                  <Button type="submit" variant="gold">
                    Approuver le brouillon choisi
                  </Button>
                </div>
              ) : null}
            </form>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <h2 className="font-bold mb-2">Détails de l&apos;action</h2>
          <pre className="text-[11px] bg-surface-2 border border-line rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(row.payload, null, 2)}
          </pre>
        </Card>
      )}

      {/* Decision controls */}
      {editable ? (
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {row.kind !== "reply_draft" ? (
              <form action={approveAndRedirectAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={row.id} />
                <Button type="submit" variant="gold">
                  Approuver
                </Button>
                <span className="text-[11px] text-ink-3">Marque cette action comme exécutée.</span>
              </form>
            ) : (
              <div />
            )}
            <form action={rejectAndRedirectAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={row.id} />
              <input
                type="text"
                name="reason"
                placeholder="Raison du rejet (optionnel)"
                className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
              />
              <Button type="submit" variant="danger">
                Rejeter
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-xs text-ink-3">
            Action {row.status}
            {row.decided_at ? ` le ${new Date(row.decided_at).toLocaleString("fr-BE")}` : ""}
            {row.decision_reason ? ` — « ${row.decision_reason} »` : ""}
          </div>
        </Card>
      )}
    </div>
  );
}
