// Karim 2026-07-08 : section « Conformité & manquements » (fiche RH, INTERNE).
// Statut de l'accusé de réception du guide conduite + journal des manquements
// (worker_compliance_events) avec total des malus ouverts et bouton « Résoudre ».
// Le scoring/journal reste INTERNE — jamais communiqué au travailleur (Phase 1).

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, Clock, Send } from "lucide-react";
import { GUIDE_DOCUMENT_KEY } from "@/lib/worker-compliance";
import { fmtDateTime } from "@/lib/datetime";
import { SendGuideAckButton } from "./send-guide-ack-button";
import { ResolveComplianceButton } from "./resolve-compliance-button";

type AckRow = {
  sent_at: string | null;
  confirmed_at: string | null;
};

type EventRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  malus: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

const KIND_LABEL: Record<string, string> = {
  questionnaire_non_complete: "Questionnaire d'accueil non complété",
  guide_non_confirme: "Guide conduite non confirmé",
};

export async function ComplianceSection({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();
  const [{ data: ackRaw }, { data: eventsRaw }] = await Promise.all([
    admin
      .from("worker_document_acks")
      .select("sent_at, confirmed_at")
      .eq("employee_id", employeeId)
      .eq("document_key", GUIDE_DOCUMENT_KEY)
      .maybeSingle(),
    admin
      .from("worker_compliance_events")
      .select("id, kind, title, detail, malus, status, created_at, resolved_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const ack = (ackRaw ?? null) as AckRow | null;
  const events = (eventsRaw ?? []) as EventRow[];
  const openEvents = events.filter((e) => e.status === "open");
  const openMalus = openEvents.reduce((sum, e) => sum + (e.malus ?? 0), 0);

  return (
    <Card id="compliance" className="overflow-hidden">
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> Conformité &amp; manquements
          {openMalus > 0 ? (
            <Badge className="bg-amber-100 text-amber-800 text-[10px]">{openMalus} malus ouverts</Badge>
          ) : null}
        </h2>
        <p className="text-[10px] text-ink-3 mt-0.5">
          Suivi INTERNE (jamais communiqué au travailleur) : accusé de réception du <strong>grand manuel</strong> (guide de conduite) et journal des manquements.
        </p>
      </div>

      {/* Accusé de réception du guide conduite */}
      <div className="p-4 border-b border-line">
        <div className="flex items-center gap-2 flex-wrap">
          {ack?.confirmed_at ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success font-semibold">
              <ShieldCheck className="w-4 h-4" /> Grand manuel confirmé le {fmtDateTime(ack.confirmed_at)}
            </span>
          ) : ack?.sent_at ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 font-semibold">
              <Clock className="w-4 h-4" /> Grand manuel envoyé le {fmtDateTime(ack.sent_at)} — pas encore confirmé
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
              <Send className="w-4 h-4" /> Grand manuel (guide de conduite) non envoyé
            </span>
          )}
          <div className="ml-auto">
            <SendGuideAckButton employeeId={employeeId} />
          </div>
        </div>
      </div>

      {/* Journal des manquements */}
      {events.length === 0 ? (
        <div className="p-4 text-center text-xs text-ink-3">Aucun manquement enregistré.</div>
      ) : (
        <div className="divide-y divide-line">
          {events.map((e) => (
            <div key={e.id} className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="muted" className="text-[10px]">{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                <Badge className="bg-red-100 text-red-700 text-[10px]">malus {e.malus}</Badge>
                <Badge
                  className={`text-[10px] ${e.status === "open" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}`}
                >
                  {e.status === "open" ? "Ouvert" : "Résolu"}
                </Badge>
                <span className="text-[10px] text-ink-3 ml-auto">{fmtDateTime(e.created_at)}</span>
              </div>
              <div className="text-sm text-ink mt-2">{e.title}</div>
              {e.detail ? <div className="text-xs text-ink-2 mt-1 whitespace-pre-wrap break-words">{e.detail}</div> : null}
              {e.status === "open" ? (
                <div className="mt-2">
                  <ResolveComplianceButton eventId={e.id} employeeId={employeeId} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
