// Karim 2026-07-08 : panneau CONTEXTE du cockpit d'évaluation.
// Tout le contexte récent du travailleur sous les yeux de l'opérateur RH pendant
// la saisie : ancienneté + dates de contrat, manquements (worker_compliance_events)
// avec total des malus ouverts, dernières notes hebdo (weekly_employee_ratings),
// signalements récents (worker_reports) et statut de l'accusé guide
// (worker_document_acks). Lecture seule, rapide, sans quitter la page.
//
// Lecture via service-role (createAdminClient) : les tables ci-dessus sont en RLS
// admin/rh. La page parente est déjà protégée requireRole + le panneau n'est rendu
// que pour les rôles admin/rh (cf. page.tsx).

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  Send,
  Star,
  MessageSquareWarning,
  CalendarClock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { GUIDE_DOCUMENT_KEY, GUIDE_ACK_SOURCE } from "@/lib/worker-compliance";
import { fmtDateTime, fmtDateY, todayISOInBrussels, daysBetweenISO } from "@/lib/datetime";
import { tenureLabel } from "@/lib/tenure";
import { ResolveComplianceButton } from "@/app/planning/employees/[id]/resolve-compliance-button";
import { QuickComplianceAdd } from "./quick-compliance";
import { CommunicationsPanel } from "./communications-panel";

const KIND_LABEL: Record<string, string> = {
  questionnaire_non_complete: "Questionnaire d'accueil non complété",
  guide_non_confirme: "Guide conduite non confirmé",
  evaluation: "Constaté en évaluation",
};

const CATEGORY_LABEL: Record<string, string> = {
  remarque: "Remarque",
  anomalie: "Anomalie",
  info: "Info",
  autre: "Autre",
};

export async function EvaluationContextPanel({
  employeeId,
  contractStart,
  contractEnd,
}: {
  employeeId: string;
  contractStart: string | null;
  contractEnd: string | null;
}) {
  const admin = createAdminClient();
  const [
    { data: eventsRaw },
    { data: ratingsRaw },
    { data: reportsRaw },
    { data: ackRaw },
    { data: guideMailRaw },
  ] = await Promise.all([
    admin
      .from("worker_compliance_events")
      .select("id, kind, title, malus, status, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("weekly_employee_ratings")
      .select("week_monday, rating, comment")
      .eq("employee_id", employeeId)
      .order("week_monday", { ascending: false })
      .limit(3),
    admin
      .from("worker_reports")
      .select("id, category, message, status, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(3),
    admin
      .from("worker_document_acks")
      .select("sent_at, confirmed_at")
      .eq("employee_id", employeeId)
      .eq("document_key", GUIDE_DOCUMENT_KEY)
      .maybeSingle(),
    admin
      .from("outbound_mails")
      .select("subject, body, sent_at")
      .eq("employee_id", employeeId)
      .eq("source", GUIDE_ACK_SOURCE)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const events = (eventsRaw ?? []) as Array<{
    id: string; kind: string; title: string; malus: number; status: string; created_at: string;
  }>;
  const ratings = (ratingsRaw ?? []) as Array<{
    week_monday: string; rating: number; comment: string | null;
  }>;
  const reports = (reportsRaw ?? []) as Array<{
    id: string; category: string | null; message: string; status: string; created_at: string;
  }>;
  const ack = (ackRaw ?? null) as { sent_at: string | null; confirmed_at: string | null } | null;
  const guideMail = (guideMailRaw ?? null) as {
    subject: string | null; body: string | null; sent_at: string | null;
  } | null;
  const empHref = `/planning/employees/${employeeId}`;

  const openEvents = events.filter((e) => e.status === "open");
  const openMalus = openEvents.reduce((s, e) => s + (e.malus ?? 0), 0);

  const today = todayISOInBrussels();
  const tenureDays = contractStart ? daysBetweenISO(contractStart, today) : null;

  return (
    <div className="space-y-3">
      {/* Ancienneté + dates de contrat */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <CalendarClock className="w-4 h-4 text-gold-dark" /> Ancienneté &amp; contrat
        </div>
        <div className="mt-2 text-sm text-ink-2">
          {contractStart ? (
            <>
              <div>
                Ancienneté :{" "}
                <strong className="text-ink">{tenureLabel(contractStart)}</strong>
                {tenureDays != null ? (
                  <span className="text-ink-3"> ({tenureDays} j)</span>
                ) : null}
              </div>
              <div className="text-xs text-ink-3 mt-1">
                Du <strong>{fmtDateY(contractStart)}</strong>{" "}
                {contractEnd ? (
                  <>au <strong>{fmtDateY(contractEnd)}</strong></>
                ) : (
                  <span className="text-ink-2">(CDI — en cours)</span>
                )}
              </div>
            </>
          ) : (
            <span className="text-ink-3">— Date de début inconnue.</span>
          )}
        </div>
      </Card>

      {/* Manquements */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-gold-dark" />
          <span className="text-sm font-bold">Manquements</span>
          {openMalus > 0 ? (
            <Badge className="bg-amber-100 text-amber-800 text-[10px]">{openMalus} malus ouverts</Badge>
          ) : (
            <Badge className="bg-green-100 text-green-700 text-[10px]">à jour</Badge>
          )}
          <Link
            href={`${empHref}#compliance`}
            className="ml-auto text-[10px] text-gold-dark hover:underline inline-flex items-center gap-0.5"
          >
            Détail <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {openEvents.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ink-3">— Aucun manquement ouvert.</div>
        ) : (
          <div className="divide-y divide-line">
            {openEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="px-4 py-2.5 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">{e.title}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="muted" className="text-[10px]">{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                    <Badge className="bg-red-100 text-red-700 text-[10px]">malus {e.malus}</Badge>
                    <span className="text-[10px] text-ink-3">{fmtDateTime(e.created_at)}</span>
                  </div>
                </div>
                <ResolveComplianceButton eventId={e.id} employeeId={employeeId} />
              </div>
            ))}
          </div>
        )}
        {/* Ajout rapide d'un manquement constaté pendant l'évaluation */}
        <div className="p-4 border-t border-line bg-surface-2/40">
          <QuickComplianceAdd employeeId={employeeId} />
        </div>
      </Card>

      {/* Dernières notes hebdo */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <Star className="w-4 h-4 fill-gold text-gold" />
          <span className="text-sm font-bold">Dernières notes hebdo</span>
          <Link
            href={`/scoring/${employeeId}`}
            className="ml-auto text-[10px] text-gold-dark hover:underline inline-flex items-center gap-0.5"
          >
            Détail <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {ratings.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ink-3">— Aucune note hebdomadaire.</div>
        ) : (
          <div className="divide-y divide-line">
            {ratings.map((r) => (
              <div key={r.week_monday} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">Semaine du {fmtDateY(r.week_monday)}</span>
                  <span className="ml-auto font-mono font-bold text-sm">{r.rating}/5</span>
                </div>
                {r.comment ? (
                  <p className="text-xs text-ink-2 mt-1 line-clamp-2 italic">"{r.comment}"</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Signalements récents */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <MessageSquareWarning className="w-4 h-4 text-gold-dark" />
          <span className="text-sm font-bold">Signalements récents</span>
          <Link
            href={`${empHref}#worker-reports`}
            className="ml-auto text-[10px] text-gold-dark hover:underline inline-flex items-center gap-0.5"
          >
            Détail <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {reports.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ink-3">— Aucun signalement.</div>
        ) : (
          <div className="divide-y divide-line">
            {reports.map((r) => (
              <div key={r.id} className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {r.category ? (
                    <Badge variant="muted" className="text-[10px]">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                  ) : null}
                  {r.status !== "handled" ? (
                    <Badge className="bg-amber-100 text-amber-800 text-[10px]">à traiter</Badge>
                  ) : null}
                  <span className="text-[10px] text-ink-3 ml-auto">{fmtDateTime(r.created_at)}</span>
                </div>
                <p className="text-xs text-ink-2 mt-1 line-clamp-2 whitespace-pre-wrap break-words">{r.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Statut guide conduite — cliquable : dépliage message + dates */}
      <Card className="overflow-hidden">
        <details className="group">
          <summary className="p-4 cursor-pointer list-none flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gold-dark shrink-0" />
            <span className="text-sm font-bold">Guide conduite</span>
            <span className="ml-auto flex items-center gap-1.5">
              {ack?.confirmed_at ? (
                <span className="inline-flex items-center gap-1 text-xs text-success font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Confirmé
                </span>
              ) : ack?.sent_at ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-semibold">
                  <Clock className="w-3.5 h-3.5" /> Envoyé, non confirmé
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <Send className="w-3.5 h-3.5" /> Non envoyé
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-ink-3 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="px-4 pb-4 pt-0 text-sm space-y-2 border-t border-line">
            <div className="pt-3 text-xs space-y-1">
              <div className="text-ink-2">
                Envoi :{" "}
                {ack?.sent_at ? (
                  <strong className="text-ink">{fmtDateTime(ack.sent_at)}</strong>
                ) : (
                  <span className="text-ink-3">non envoyé</span>
                )}
              </div>
              <div className="text-ink-2">
                Confirmation :{" "}
                {ack?.confirmed_at ? (
                  <strong className="text-success">{fmtDateTime(ack.confirmed_at)}</strong>
                ) : (
                  <span className="text-ink-3">en attente</span>
                )}
              </div>
            </div>
            {guideMail ? (
              <div className="rounded-md bg-surface-2/50 border border-line p-2.5">
                <div className="text-[11px] font-semibold text-ink">
                  {guideMail.subject || "Guide conduite à confirmer"}
                </div>
                {guideMail.body ? (
                  <div className="text-xs text-ink-2 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                    {guideMail.body}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-ink-3">
                — Aucun message « guide à confirmer » archivé pour ce travailleur.
              </div>
            )}
            <div>
              <Link href={`${empHref}#compliance`} className="text-[11px] text-gold-dark hover:underline">
                Ouvrir la conformité sur la fiche →
              </Link>
            </div>
          </div>
        </details>
      </Card>

      {/* Communications & messages programmés */}
      <CommunicationsPanel employeeId={employeeId} contractStart={contractStart} />
    </div>
  );
}
