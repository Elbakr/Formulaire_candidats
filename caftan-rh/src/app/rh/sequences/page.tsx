import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { ArrowRight, Workflow } from "lucide-react";
import { NewSequenceButton } from "./new-sequence-button";
import { SequenceToggle } from "./sequence-toggle";

type SeqRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_status: string | null;
  is_active: boolean;
  step_count: { count: number }[] | null;
  active_runs: { count: number }[] | null;
};

export default async function SequencesListPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("sequences")
    .select(
      "id, name, description, trigger_status, is_active, step_count:sequence_steps(count), active_runs:sequence_runs(count)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as SeqRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Séquences automatisées</h1>
          <p className="text-sm text-ink-2">
            Workflows qui se déclenchent quand le statut d'une candidature change. Une séquence enchaîne emails, notifications, notes et délais.
          </p>
        </div>
        <NewSequenceButton />
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            <Workflow className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Aucune séquence pour l'instant.</p>
            <p className="mt-1">Crée une première séquence pour automatiser tes relances et notifications.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {rows.map((s) => {
              const steps = s.step_count?.[0]?.count ?? 0;
              const runs = s.active_runs?.[0]?.count ?? 0;
              return (
                <div key={s.id} className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/rh/sequences/${s.id}`} className="font-bold hover:text-gold-dark">
                        {s.name}
                      </Link>
                      {s.trigger_status ? (
                        <Badge variant={s.trigger_status as never}>
                          → {STATUS_LABELS[s.trigger_status] ?? s.trigger_status}
                        </Badge>
                      ) : (
                        <Badge variant="muted">Manuel uniquement</Badge>
                      )}
                      {!s.is_active && <Badge variant="muted">Inactive</Badge>}
                    </div>
                    {s.description ? (
                      <div className="text-xs text-ink-3 mt-1">{s.description}</div>
                    ) : null}
                    <div className="text-[11px] text-ink-3 mt-1 font-mono">
                      {steps} étape{steps > 1 ? "s" : ""} · {runs} exécution{runs > 1 ? "s" : ""}
                    </div>
                  </div>
                  <SequenceToggle id={s.id} isActive={s.is_active} />
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/rh/sequences/${s.id}`}>
                      Modifier <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="text-xs text-ink-3">
        <p>
          <strong>Comment ça marche :</strong> définis un <em>statut déclencheur</em> (ex. <code>contacted</code>) ; dès qu'une candidature passe à ce statut, la séquence démarre automatiquement et chaque étape s'exécute après son délai. Le cron <code>/api/cron/sequences-tick</code> traite les étapes dues toutes les 10 minutes.
        </p>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
