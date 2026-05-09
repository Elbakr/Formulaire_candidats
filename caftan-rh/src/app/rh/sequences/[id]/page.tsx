import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { SequenceEditor } from "./editor";
import { RunOnCandidatesDialog } from "./run-on-candidates";

export const dynamic = "force-dynamic";

export default async function SequenceDetailPage(props: PageProps<"/rh/sequences/[id]">) {
  await requireRole(["admin", "rh"]);
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: seq }, { data: steps }, { data: tmpls }, { data: runs }, { data: apps }] =
    await Promise.all([
      supabase
        .from("sequences")
        .select("id, name, description, trigger_status, is_active")
        .eq("id", id)
        .single(),
      supabase
        .from("sequence_steps")
        .select(
          "id, position, kind, delay_days, email_template_slug, email_subject_override, email_custom_message, notification_target, notification_title, notification_body, note_body, set_status_to",
        )
        .eq("sequence_id", id)
        .order("position", { ascending: true }),
      supabase
        .from("email_templates")
        .select("slug, label")
        .eq("is_active", true)
        .order("label"),
      supabase
        .from("sequence_runs")
        .select(
          "id, status, started_at, finished_at, application_id, application:applications(id, candidate:candidates(full_name))",
        )
        .eq("sequence_id", id)
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("applications")
        .select("id, status, candidate:candidates(full_name)")
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);

  if (!seq) notFound();

  type RunRow = {
    id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    application_id: string;
    application: { id: string; candidate: { full_name: string } | null } | null;
  };
  const runRows = (runs ?? []) as unknown as RunRow[];

  type AppRow = { id: string; status: string; candidate: { full_name: string } | null };
  const appRows = (apps ?? []) as unknown as AppRow[];

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/rh/sequences">
            <ArrowLeft className="h-3.5 w-3.5" /> Toutes les séquences
          </Link>
        </Button>
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{(seq as { name: string }).name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {(seq as { trigger_status: string | null }).trigger_status ? (
              <Badge variant={(seq as { trigger_status: string }).trigger_status as never}>
                Déclenche → {STATUS_LABELS[(seq as { trigger_status: string }).trigger_status] ?? (seq as { trigger_status: string }).trigger_status}
              </Badge>
            ) : (
              <Badge variant="muted">Manuel uniquement</Badge>
            )}
            {(seq as { is_active: boolean }).is_active ? (
              <Badge variant="hired">Active</Badge>
            ) : (
              <Badge variant="muted">Inactive</Badge>
            )}
          </div>
          {(seq as { description: string | null }).description ? (
            <p className="text-sm text-ink-2 mt-2 max-w-prose">
              {(seq as { description: string }).description}
            </p>
          ) : null}
        </div>
        <RunOnCandidatesDialog
          sequenceId={id}
          applications={appRows.map((a) => ({
            id: a.id,
            label: `${a.candidate?.full_name ?? "—"} · ${STATUS_LABELS[a.status] ?? a.status}`,
          }))}
        />
      </div>

      <SequenceEditor
        sequence={seq as never}
        steps={(steps ?? []) as never}
        templates={(tmpls ?? []) as never}
      />

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">Exécutions récentes</h2>
        </div>
        {runRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">
            Aucune exécution pour l'instant.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {runRows.map((r) => (
              <Link
                key={r.id}
                href={`/rh/candidates/${r.application_id}`}
                className="flex items-center gap-3 p-3 text-sm hover:bg-surface-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">
                    {r.application?.candidate?.full_name ?? "Candidat inconnu"}
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    Démarré : {formatDateTime(r.started_at)}
                    {r.finished_at ? ` · Fini : ${formatDateTime(r.finished_at)}` : ""}
                  </div>
                </div>
                <Badge variant={r.status === "active" ? "rdv_scheduled" : r.status === "done" ? "hired" : "muted"}>
                  {r.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
