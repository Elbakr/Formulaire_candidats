import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle, AlertTriangle, Info, CheckCircle2, User, Clock, Wrench, HelpCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";
import { qcmFor, behaviorLabel, type IncidentExplain } from "@/lib/incident/qcm";
import { getLearningsForSignature, isAutoPaused } from "@/lib/incident/learnings";
import { IncidentQcm } from "./incident-qcm";
import { NlCommandBar } from "./nl-command-bar";

export const dynamic = "force-dynamic";

const SEV: Record<string, { Icon: typeof AlertCircle; cls: string; label: string }> = {
  critical: { Icon: AlertCircle, cls: "text-danger", label: "Critique" },
  warning: { Icon: AlertTriangle, cls: "text-warn", label: "Attention" },
  info: { Icon: Info, cls: "text-info", label: "Info" },
};

export default async function IncidentPage(props: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: incRaw } = await admin
    .from("incidents")
    .select("id, signature, severity, title, problem, status, occurrences, repair_model, resolution, data, created_at, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!incRaw) notFound();
  const inc = incRaw as {
    id: string; signature: string; severity: string; title: string; problem: string | null;
    status: string; occurrences: number; repair_model: string | null;
    resolution: { cause?: string; solution?: string; prevention?: string } | null;
    data: Record<string, unknown> | null;
    created_at: string; resolved_at: string | null;
  };

  const qcm = qcmFor(inc.signature);
  // Explication : per-incident (data.explain) si présente, sinon le template du type.
  const explainData = (inc.data?.explain ?? null) as IncidentExplain | null;
  const explain: IncidentExplain = explainData ?? {
    what: qcm.what, why: qcm.why, remedies: qcm.remedies,
    who: (inc.data?.who as string) ?? null, event: (inc.data?.event as string) ?? null,
  };

  const learnings = await getLearningsForSignature(inc.signature);
  const activeAnswers: Record<string, string> = {};
  const activeLabels: Record<string, string> = {};
  const activeCustomValues: Record<string, string> = {};
  for (const l of learnings) {
    const qk = l.question_key ?? "default";
    activeAnswers[qk] = l.chosen_option;
    activeLabels[qk] = behaviorLabel(l.chosen_option);
    if (l.chosen_option === "custom" && l.custom_value) {
      activeCustomValues[qk] = l.custom_value;
    }
  }
  const paused = await isAutoPaused();
  const sev = SEV[inc.severity] ?? SEV.info;
  const isResolved = inc.status === "resolved";

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/me/notifications" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-gold-dark">
        <ArrowLeft className="h-4 w-4" /> Notifications
      </Link>

      {/* En-tête */}
      <Card>
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <sev.Icon className={`h-5 w-5 ${sev.cls}`} />
            <h1 className="text-xl font-bold">{inc.title}</h1>
          </div>
          <div className="text-[11px] text-ink-3">
            {sev.label} · <code className="text-ink-2">{inc.signature}</code> · {inc.occurrences}× · ouvert le {fmtDateTime(inc.created_at)}
            {isResolved
              ? <span className="ml-1 inline-flex items-center gap-1 text-success font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> Résolu {inc.resolved_at ? `(${fmtDateTime(inc.resolved_at)})` : ""}</span>
              : <span className="ml-1 text-warn font-semibold">Ouvert</span>}
          </div>
        </div>
      </Card>

      {/* Explication claire : qui / quoi / le problème / pourquoi / remèdes */}
      <Card>
        <div className="p-4 space-y-3 text-sm">
          {(explain.who || explain.event) ? (
            <div className="flex flex-col gap-1.5 rounded-md bg-surface-2 p-2.5">
              {explain.who ? <div className="flex items-center gap-2"><User className="h-4 w-4 text-ink-3 shrink-0" /> <span><b>Concerné :</b> {explain.who}</span></div> : null}
              {explain.event ? <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-ink-3 shrink-0" /> <span><b>Événement :</b> {explain.event}</span></div> : null}
            </div>
          ) : null}

          <div>
            <div className="font-bold text-ink mb-0.5">Le problème, simplement</div>
            <p className="text-ink-2">{explain.what}</p>
            {inc.problem && inc.problem !== explain.what ? <p className="text-ink-3 mt-1">{inc.problem}</p> : null}
          </div>

          <div>
            <div className="font-bold text-ink mb-0.5">Pourquoi ça compte</div>
            <p className="text-ink-2">{explain.why}</p>
          </div>

          {explain.remedies?.length ? (
            <div>
              <div className="font-bold text-ink mb-1 flex items-center gap-1.5"><Wrench className="h-4 w-4 text-gold-dark" /> Remèdes</div>
              <ul className="space-y-1">
                {explain.remedies.map((r, i) => (
                  <li key={i} className="flex gap-2 text-ink-2"><span className="text-gold-dark">•</span> <span>{r}</span></li>
                ))}
              </ul>
            </div>
          ) : null}

          {isResolved && inc.resolution ? (
            <div className="text-xs text-ink-2 space-y-0.5 border-t border-line pt-2">
              {inc.resolution.solution ? <div><b>Solution appliquée :</b> {inc.resolution.solution}</div> : null}
              {inc.resolution.prevention ? <div><b>Prévention :</b> {inc.resolution.prevention}</div> : null}
              {inc.repair_model ? <div className="text-ink-3">Modèle : {inc.repair_model}</div> : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* QCM d'apprentissage */}
      <div className="flex items-center gap-1.5 text-[11px] text-ink-3 px-1">
        <HelpCircle className="h-3.5 w-3.5" /> Tes réponses entraînent l'agent : les choix « auto » répétés montent en autonomie, toujours révocables.
      </div>
      <IncidentQcm
        incidentId={inc.id}
        signature={inc.signature}
        questions={qcm.questions}
        activeAnswers={activeAnswers}
        activeLabels={activeLabels}
        activeCustomValues={activeCustomValues}
        autoPaused={paused}
      />

      <NlCommandBar incidentId={inc.id} />
    </div>
  );
}
