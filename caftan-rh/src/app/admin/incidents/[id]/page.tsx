import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";
import { qcmFor, behaviorLabel } from "@/lib/incident/qcm";
import { getActiveLearning, isAutoPaused } from "@/lib/incident/learnings";
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
    .select("id, signature, severity, title, problem, status, occurrences, repair_model, resolution, created_at, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!incRaw) notFound();
  const inc = incRaw as {
    id: string; signature: string; severity: string; title: string; problem: string | null;
    status: string; occurrences: number; repair_model: string | null;
    resolution: { cause?: string; solution?: string; prevention?: string } | null;
    created_at: string; resolved_at: string | null;
  };

  const qcm = qcmFor(inc.signature);
  const active = await getActiveLearning(inc.signature);
  const paused = await isAutoPaused();
  const sev = SEV[inc.severity] ?? SEV.info;
  const isResolved = inc.status === "resolved";

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/me/notifications" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-gold-dark">
        <ArrowLeft className="h-4 w-4" /> Notifications
      </Link>

      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <sev.Icon className={`h-5 w-5 ${sev.cls}`} />
            <h1 className="text-xl font-bold">{inc.title}</h1>
          </div>
          <div className="text-[11px] text-ink-3">
            {sev.label} · signature <code className="text-ink-2">{inc.signature}</code> ·{" "}
            {inc.occurrences}× · ouvert le {fmtDateTime(inc.created_at)}
            {isResolved ? (
              <span className="ml-1 inline-flex items-center gap-1 text-success font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Résolu {inc.resolved_at ? `(${fmtDateTime(inc.resolved_at)})` : ""}
              </span>
            ) : (
              <span className="ml-1 text-warn font-semibold">Ouvert</span>
            )}
          </div>
          {inc.problem ? (
            <p className="text-sm text-ink-2">
              <span className="font-semibold">Problème : </span>
              {inc.problem}
            </p>
          ) : null}
          {isResolved && inc.resolution ? (
            <div className="text-xs text-ink-2 space-y-0.5 border-t border-line pt-2">
              {inc.resolution.solution ? <div><b>Solution :</b> {inc.resolution.solution}</div> : null}
              {inc.resolution.prevention ? <div><b>Prévention :</b> {inc.resolution.prevention}</div> : null}
              {inc.repair_model ? <div className="text-ink-3">Modèle : {inc.repair_model}</div> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <IncidentQcm
        incidentId={inc.id}
        signature={inc.signature}
        question={qcm.question}
        options={qcm.options}
        activeOption={active?.chosen_option ?? null}
        activeLabel={active ? behaviorLabel(active.chosen_option) : null}
        status={inc.status}
        autoPaused={paused}
      />

      <NlCommandBar incidentId={inc.id} />
    </div>
  );
}
