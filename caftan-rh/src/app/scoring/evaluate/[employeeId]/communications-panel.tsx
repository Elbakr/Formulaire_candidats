// Karim 2026-07-08 : panneau « Communications & messages programmés ».
// Transparence TOTALE des communications automatiques du travailleur, à côté du
// cockpit d'évaluation :
//   - ENVOYÉS  : journal des outbound_mails de l'employé (date Europe/Brussels +
//     libellé lisible de la source + sujet). Chaque ligne se déplie (native
//     <details>) et affiche le CONTENU exact du message (texte, sinon HTML maison).
//   - PROGRAMMÉS : prochains envois AUTOMATIQUES avec leur date prévue :
//       • prochain message d'accompagnement (worker_followup) via nextFollowupSchedule,
//       • relance / manquement questionnaire d'accueil (pre_interviews onboarding),
//       • manquement guide conduite (worker_document_acks).
//
// Lecture seule via service-role (createAdminClient). La page parente est déjà
// protégée requireRole + ce panneau n'est rendu que pour admin/rh (cf. page.tsx) :
// le contenu des mails N'EST PAS exposé aux managers.

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, CalendarClock, ChevronDown, Clock, AlertTriangle } from "lucide-react";
import { fmtDateTime, fmtDateY } from "@/lib/datetime";
import {
  nextFollowupSchedule,
  followupMilestoneLabel,
} from "@/lib/worker-followup";
import { GUIDE_DOCUMENT_KEY } from "@/lib/worker-compliance";

const H = 3600 * 1000;

// Libellés FR lisibles des `source` d'outbound_mails (cycle de vie travailleur +
// sources historiques). Fallback : la valeur brute de la source.
const COMM_SOURCE_LABELS: Record<string, string> = {
  // Cycle de vie travailleur (automatique)
  worker_welcome_questionnaire: "Bienvenue + questionnaire d'accueil",
  worker_onboarding_sheet: "Fiche d'onboarding",
  worker_followup: "Message d'accompagnement",
  onboarding_reminder: "Relance questionnaire",
  document_ack_request: "Guide conduite à confirmer",
  candidate_recap_confirm: "Récapitulatif dossier",
  prevalidated_link: "Invitation à compléter le dossier",
  // Contrat / paie / RH
  contract_signature: "Contrat à signer",
  contract_employer_archive: "Archive employeur contrat",
  info_request: "Demande d'infos manquantes",
  payslip_share: "Fiche de paie",
  payslip_share_external: "Fiche de paie (externe)",
  magic_link: "Lien de connexion auto",
  password_reset: "Réinitialisation mot de passe",
  cdd_renewal_prenotice: "Pré-avis renouvellement CDD",
  termination_signed_hr: "Rupture signée (RH)",
  termination_signed_employee: "Rupture signée (travailleur)",
  employment_end: "Fin de contrat",
  id_card_secsoc: "Carte d'identité — secrétariat social",
  screening_request: "Invitation questionnaire",
  tunnel_recap: "Récap tunnel",
  manual: "Mail manuel",
};

function sourceLabel(source: string): string {
  return COMM_SOURCE_LABELS[source] ?? source;
}

type MailRow = {
  id: string;
  sent_at: string;
  subject: string | null;
  source: string;
  status: string | null;
  body: string | null;
  body_html: string | null;
  recipient_email: string | null;
};

export async function CommunicationsPanel({
  employeeId,
  contractStart,
}: {
  employeeId: string;
  contractStart: string | null;
}) {
  const admin = createAdminClient();

  // Employé : candidate_id pour retrouver le questionnaire d'accueil (pre_interviews).
  const { data: empRow } = await admin
    .from("employees")
    .select("candidate_id")
    .eq("id", employeeId)
    .maybeSingle();
  const candidateId = (empRow as { candidate_id: string | null } | null)?.candidate_id ?? null;

  const [{ data: mailsRaw }, { data: followupsRaw }, { data: ackRaw }] = await Promise.all([
    admin
      .from("outbound_mails")
      .select("id, sent_at, subject, source, status, body, body_html, recipient_email")
      .eq("employee_id", employeeId)
      .order("sent_at", { ascending: false })
      .limit(40),
    admin
      .from("worker_followups")
      .select("milestone")
      .eq("employee_id", employeeId),
    admin
      .from("worker_document_acks")
      .select("sent_at, confirmed_at")
      .eq("employee_id", employeeId)
      .eq("document_key", GUIDE_DOCUMENT_KEY)
      .maybeSingle(),
  ]);

  const mails = (mailsRaw ?? []) as MailRow[];
  const sentMilestones = ((followupsRaw ?? []) as Array<{ milestone: string }>).map((r) => r.milestone);
  const ack = (ackRaw ?? null) as { sent_at: string | null; confirmed_at: string | null } | null;

  // Questionnaire d'accueil (pre_interviews context='onboarding') via candidate -> applications.
  type OnboardingPi = { sent_at: string | null; reminded_at: string | null; status: string | null };
  let onboardingPi: OnboardingPi | null = null;
  if (candidateId) {
    const { data: appRows } = await admin
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId);
    const appIds = ((appRows ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (appIds.length > 0) {
      const { data: piRaw } = await admin
        .from("pre_interviews")
        .select("sent_at, reminded_at, status")
        .in("application_id", appIds)
        .eq("context", "onboarding")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      onboardingPi = (piRaw ?? null) as OnboardingPi | null;
    }
  }

  // ── PROGRAMMÉS ─────────────────────────────────────────────────────────────
  type Scheduled = { key: string; label: string; dateLabel: string; overdue: boolean; note?: string };
  const scheduled: Scheduled[] = [];

  // 1) Prochain message d'accompagnement.
  const nextFu = nextFollowupSchedule(contractStart, sentMilestones);
  if (nextFu) {
    scheduled.push({
      key: "followup",
      label: `Message d'accompagnement — ${followupMilestoneLabel(nextFu.milestone)}`,
      dateLabel: fmtDateY(nextFu.dueDateISO),
      overdue: nextFu.overdue,
      note: nextFu.overdue ? "échéance passée — au prochain envoi automatique" : undefined,
    });
  }

  // 2) Relance / manquement questionnaire d'accueil.
  if (onboardingPi && onboardingPi.status !== "completed" && onboardingPi.sent_at) {
    const sentMs = new Date(onboardingPi.sent_at).getTime();
    const now = Date.now();
    if (!onboardingPi.reminded_at) {
      const dueMs = sentMs + 24 * H;
      scheduled.push({
        key: "onboarding-reminder",
        label: "Relance questionnaire d'accueil",
        dateLabel: fmtDateTime(new Date(dueMs).toISOString()),
        overdue: now > dueMs,
        note: now > dueMs ? "échéance passée — au prochain passage du suivi" : undefined,
      });
    } else {
      const dueMs = sentMs + 48 * H;
      scheduled.push({
        key: "onboarding-gap",
        label: "Manquement questionnaire d'accueil (déjà relancé)",
        dateLabel: fmtDateTime(new Date(dueMs).toISOString()),
        overdue: now > dueMs,
      });
    }
  }

  // 3) Manquement guide conduite (envoyé, non confirmé).
  if (ack?.sent_at && !ack.confirmed_at) {
    const dueMs = new Date(ack.sent_at).getTime() + 72 * H;
    scheduled.push({
      key: "guide-gap",
      label: "Manquement si guide conduite non confirmé",
      dateLabel: fmtDateTime(new Date(dueMs).toISOString()),
      overdue: Date.now() > dueMs,
    });
  }

  return (
    <>
      {/* ENVOYÉS */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <Mail className="w-4 h-4 text-gold-dark" />
          <span className="text-sm font-bold">Messages envoyés</span>
          <Badge variant="muted" className="text-[10px] ml-auto">{mails.length}</Badge>
        </div>
        {mails.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ink-3">— Aucun message envoyé à ce travailleur.</div>
        ) : (
          <div className="divide-y divide-line max-h-96 overflow-y-auto">
            {mails.map((m) => (
              <details key={m.id} className="group">
                <summary className="px-4 py-2.5 cursor-pointer list-none flex items-start gap-2 hover:bg-surface-2/40">
                  <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-ink-3 shrink-0 transition-transform group-open:rotate-180" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{m.subject || "(sans objet)"}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="muted" className="text-[10px]">{sourceLabel(m.source)}</Badge>
                      {m.status === "failed" ? (
                        <Badge className="bg-red-100 text-red-700 text-[10px]">échec</Badge>
                      ) : null}
                      <span className="text-[10px] text-ink-3">{fmtDateTime(m.sent_at)}</span>
                    </div>
                  </div>
                </summary>
                <div className="px-4 pb-3 pt-1 pl-9 text-xs text-ink-2">
                  <div className="text-[10px] text-ink-3 mb-1.5">
                    Envoyé le {fmtDateTime(m.sent_at)}
                    {m.recipient_email ? <> · à {m.recipient_email}</> : null}
                  </div>
                  {m.body ? (
                    <div className="whitespace-pre-wrap break-words rounded-md bg-surface-2/50 border border-line p-2.5 leading-relaxed">
                      {m.body}
                    </div>
                  ) : m.body_html ? (
                    <div className="rounded-md bg-white border border-line p-2.5 overflow-x-auto">
                      <div
                        className="text-[13px] [&_a]:text-gold-dark [&_a]:underline"
                        // Contenu maison (gabarits internes), non issu d'une saisie utilisateur.
                        dangerouslySetInnerHTML={{ __html: m.body_html }}
                      />
                    </div>
                  ) : (
                    <div className="text-ink-3 italic">— Contenu non archivé pour ce message.</div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      {/* PROGRAMMÉS */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-gold-dark" />
          <span className="text-sm font-bold">Messages programmés (à venir)</span>
        </div>
        {scheduled.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ink-3">— Aucun envoi automatique programmé.</div>
        ) : (
          <div className="divide-y divide-line">
            {scheduled.map((s) => (
              <div key={s.key} className="px-4 py-2.5 flex items-start gap-2">
                {s.overdue ? (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-ink-3 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">{s.label}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge
                      className={`text-[10px] ${s.overdue ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}
                    >
                      prévu le {s.dateLabel}
                    </Badge>
                    {s.note ? <span className="text-[10px] text-ink-3">{s.note}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
