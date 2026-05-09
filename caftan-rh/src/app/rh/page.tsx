import Link from "next/link";
import { fetchApplications, fetchPipelineCounts } from "@/lib/queries";
import { PIPELINE_STAGES } from "@/lib/config";
import { Card } from "@/components/ui/card";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus } from "lucide-react";

export default async function RhDashboardPage() {
  const [counts, recent] = await Promise.all([
    fetchPipelineCounts(),
    fetchApplications({ limit: 8 }),
  ]);

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-ink-2">Vue d'ensemble du recrutement.</p>
        </div>
        <Button asChild variant="gold">
          <Link href="/rh/candidates"><Plus className="h-4 w-4" /> Nouveau candidat</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatCard label="Total" value={total} />
        {PIPELINE_STAGES.map((s) => (
          <StatCard key={s.id} label={s.label} value={counts[s.id] ?? 0} />
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="font-bold">Activité récente</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/rh/candidates">Voir tout <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
        <div className="divide-y divide-line">
          {recent.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">
              Aucune candidature pour l'instant. Crée une offre publique pour recevoir des candidatures, ou ajoute un candidat manuellement.
            </div>
          ) : (
            recent.map((app) => (
              <Link
                key={app.id}
                href={`/rh/candidates/${app.id}`}
                className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
              >
                <NameAvatar name={app.candidate.full_name} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{app.candidate.full_name}</div>
                  <div className="text-xs text-ink-3 truncate">
                    {app.job?.title ?? "Spontanée"} · {formatDate(app.updated_at)}
                  </div>
                </div>
                <Badge variant={app.status as never}>{STATUS_LABELS[app.status]}</Badge>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] bg-surface border border-line p-3 hover:border-gold transition-colors cursor-default">
      <div className="text-2xl font-extrabold font-mono leading-none">{value}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-bold text-ink-3">{label}</div>
    </div>
  );
}
