import Link from "next/link";
import {
  Sparkles,
  ListChecks,
  Hourglass,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";

type PendingReview = {
  id: string;
  application_id: string;
  position_role: string;
  completed_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  status: string;
  decision: string | null;
  application: {
    candidate: { full_name: string; email: string } | null;
    job: { title: string | null } | null;
  } | null;
};

export default async function AdminPreInterviewPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const nowIso = new Date().toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const baseSelect =
    "id, application_id, position_role, completed_at, sent_at, expires_at, status, decision, application:applications!inner(candidate:candidates(full_name, email), job:jobs(title))";

  const [pendingRes, sentRes, monthSentRes, monthCompletedRes, completedAvgRes] = await Promise.all([
    supabase
      .from("pre_interviews")
      .select(baseSelect)
      .eq("status", "completed")
      .is("decision", null)
      .order("completed_at", { ascending: true })
      .limit(50),
    supabase
      .from("pre_interviews")
      .select(baseSelect)
      .in("status", ["sent", "started"])
      .order("expires_at", { ascending: true })
      .limit(50),
    supabase
      .from("pre_interviews")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", monthAgo),
    supabase
      .from("pre_interviews")
      .select("id", { count: "exact", head: true })
      .gte("completed_at", monthAgo),
    supabase
      .from("pre_interviews")
      .select("sent_at, completed_at")
      .not("completed_at", "is", null)
      .gte("sent_at", monthAgo)
      .limit(200),
  ]);

  const pending = (pendingRes.data ?? []) as unknown as PendingReview[];
  const sent = (sentRes.data ?? []) as unknown as PendingReview[];

  const monthSent = monthSentRes.count ?? 0;
  const monthCompleted = monthCompletedRes.count ?? 0;
  const completionRate =
    monthSent > 0 ? Math.round((monthCompleted / monthSent) * 100) : 0;

  let avgDurationHours = 0;
  const completedRows = (completedAvgRes.data ?? []) as Array<{
    sent_at: string | null;
    completed_at: string | null;
  }>;
  if (completedRows.length > 0) {
    let total = 0;
    let n = 0;
    for (const r of completedRows) {
      if (!r.sent_at || !r.completed_at) continue;
      const diff = new Date(r.completed_at).getTime() - new Date(r.sent_at).getTime();
      if (diff > 0) {
        total += diff;
        n += 1;
      }
    }
    avgDurationHours = n > 0 ? Math.round(total / n / 3600 / 1000) : 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-dark" /> Pré-entretiens
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            File d&apos;attente de review + suivi des envois en cours.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/pre-interview/questions">
            <ListChecks className="h-4 w-4" /> Banque de questions
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Envoyés ce mois"
          value={monthSent}
          icon={Sparkles}
        />
        <Stat
          label="Complétés ce mois"
          value={monthCompleted}
          icon={CheckCircle2}
        />
        <Stat
          label="Taux de complétion"
          value={`${completionRate}%`}
          icon={Hourglass}
        />
        <Stat
          label="Délai moyen"
          value={avgDurationHours > 0 ? `${avgDurationHours} h` : "—"}
          icon={Hourglass}
        />
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> À reviewer ({pending.length})
          </h2>
          <p className="text-xs text-ink-3">
            Pré-entretiens complétés en attente d&apos;une décision RH.
          </p>
        </div>
        {pending.length === 0 ? (
          <div className="p-6 text-sm text-ink-3 italic text-center">
            Rien à reviewer pour le moment. Bravo.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-sm">
                    {p.application?.candidate?.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-ink-3">
                    {p.application?.job?.title ?? "Candidature spontanée"} ·{" "}
                    {p.application?.candidate?.email ?? ""}
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    Complété le {p.completed_at ? formatDateTime(p.completed_at) : "—"} ·{" "}
                    Profil: {p.position_role}
                  </div>
                </div>
                <Button asChild size="sm" variant="gold">
                  <Link href={`/rh/candidates/${p.application_id}?tab=pre-interview`}>
                    Reviewer <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-warn" /> Envoyés, en attente du candidat ({sent.length})
          </h2>
        </div>
        {sent.length === 0 ? (
          <div className="p-6 text-sm text-ink-3 italic text-center">
            Aucun pré-entretien en attente.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sent.map((p) => {
              const expired = !!p.expires_at && new Date(p.expires_at).getTime() < Date.now();
              return (
                <li key={p.id} className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-sm">
                      {p.application?.candidate?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-ink-3">
                      {p.application?.job?.title ?? "Candidature spontanée"}
                    </div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Envoyé le {p.sent_at ? formatDate(p.sent_at) : "—"}
                      {p.expires_at ? (
                        <>
                          {" "}
                          · Expire le {formatDate(p.expires_at)}
                          {expired ? (
                            <span className="text-danger font-bold ml-1">(échu)</span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                      (p.status === "started"
                        ? "bg-warn-light text-warn"
                        : "bg-info-light text-info")
                    }
                  >
                    {p.status}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/rh/candidates/${p.application_id}?tab=pre-interview`}>
                      Ouvrir <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-surface border border-line p-4">
      <Icon className="h-5 w-5 text-gold-dark" />
      <div className="text-2xl font-extrabold font-mono mt-2">{value}</div>
      <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 mt-0.5">
        {label}
      </div>
    </div>
  );
}
