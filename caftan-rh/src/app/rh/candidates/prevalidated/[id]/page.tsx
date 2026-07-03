import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Briefcase, CheckCircle2, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/server";
import { getCandidateIdCard } from "@/lib/id-card";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate, formatDateTime } from "@/lib/utils";

// Karim 2026-07-03 : vue de revue d'un CANDIDAT PRÉ-VALIDÉ (lien de pré-embauche).
// Ces candidats n'ont PAS de candidature (applications) — la page candidat
// classique /rh/candidates/[id] (basée sur applications) renvoyait donc un 404.
// Ici on lit directement la fiche candidat + les infos qu'il a auto-remplies.

const EDUCATION_LABELS: Record<string, string> = {
  sans_diplome: "Sans diplôme",
  secondaire_inferieur: "Secondaire inférieur",
  secondaire_superieur: "Secondaire supérieur (CESS)",
  bachelier: "Bachelier",
  master: "Master ou +",
  autre: "Autre",
};
const MARITAL_LABELS: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  cohabitant_legal: "Cohabitant(e) légal(e)",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
};

export default async function PrevalidatedCandidatePage(
  props: { params: Promise<{ id: string }> },
) {
  await requireRole(["admin", "rh"]);
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: candRaw } = await admin
    .from("candidates")
    .select(
      "id, full_name, email, prevalidated, is_student, birth_date, birth_place, nrn, nationality, address, postal_code, city, iban, education_level, marital_status, dependent_children, transport_type, transport_frequency, transport_price, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!candRaw) notFound();
  const c = candRaw as Record<string, string | number | boolean | null>;
  // Karim 2026-07-03 (audit) : cette vue est réservée aux candidats PRÉ-VALIDÉS
  // (sans candidature). Un candidat normal a sa fiche /rh/candidates/[id].
  if (c.prevalidated !== true) notFound();

  // Token (statut du lien + complétion).
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("sent_at, completed_at, created_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tok = (tokRaw ?? null) as { sent_at: string | null; completed_at: string | null; created_at: string | null } | null;

  // Indisponibilités déclarées par le candidat (étape 2) — base de planning RH.
  const { data: unavailRaw } = await admin
    .from("candidate_unavailabilities")
    .select("id, day_of_week, date_specific, date_end, start_time, end_time, reason, notes")
    .eq("candidate_id", id)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true })
    .order("date_specific", { ascending: true });
  const unavail = (unavailRaw ?? []) as Array<{ id: string; day_of_week: number | null; date_specific: string | null; date_end: string | null; start_time: string | null; end_time: string | null; reason: string | null }>;
  const recurringU = unavail.filter((u) => u.day_of_week !== null);
  const specificU = unavail.filter((u) => u.date_specific !== null);
  const DOW_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const REASON_LBL: Record<string, string> = { vacances: "Vacances/congé", hospitalisation: "Hospitalisation", examen: "Examen", cours: "Cours/école", medical: "RDV médical", perso: "Personnel", autre: "Autre" };
  const slot = (s: string | null, e: string | null) => (s && e ? `${s.slice(0, 5)}–${e.slice(0, 5)}` : "journée entière");

  // Carte d'identité (recto/verso fusionnés en 1 PDF) fournie par le candidat.
  const idCard = await getCandidateIdCard(admin, id);
  let idCardUrl: string | null = null;
  if (idCard) {
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(idCard.storage_path, 3600);
    idCardUrl = signed?.signedUrl ?? null;
  }

  const fullName = (c.full_name as string) || "Candidat pré-validé";
  const isStudent = c.is_student;

  const val = (v: string | number | boolean | null | undefined) =>
    v === null || v === undefined || String(v).trim() === "" ? null : String(v);

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Email", value: val(c.email as string) },
    { label: "Date de naissance", value: c.birth_date ? formatDate(c.birth_date as string) : null },
    { label: "Lieu de naissance", value: val(c.birth_place as string) },
    { label: "Numéro national (NISS)", value: val(c.nrn as string) },
    { label: "Nationalité", value: val(c.nationality as string) },
    { label: "Adresse", value: c.address ? `${c.address}, ${c.postal_code ?? ""} ${c.city ?? ""}`.trim() : null },
    { label: "IBAN", value: val(c.iban as string) },
    { label: "Niveau scolaire", value: c.education_level ? (EDUCATION_LABELS[c.education_level as string] ?? String(c.education_level)) : null },
    { label: "État civil", value: c.marital_status ? (MARITAL_LABELS[c.marital_status as string] ?? String(c.marital_status)) : null },
    { label: "Personnes à charge", value: c.dependent_children != null ? String(c.dependent_children) : null },
    { label: "Moyen de transport", value: val(c.transport_type as string) },
    { label: "Abonnement transport", value: val(c.transport_frequency as string) },
    { label: "Prix transport (€)", value: c.transport_price != null ? String(c.transport_price) : null },
  ];
  // Karim 2026-07-03 (audit) : pour un étudiant, état civil + personnes à charge
  // ne sont pas demandés -> exclus du compteur et de la liste "à compléter".
  const shownRows = isStudent === true
    ? rows.filter((r) => r.label !== "État civil" && r.label !== "Personnes à charge")
    : rows;
  const filled = shownRows.filter((r) => r.value !== null).length;
  const missing = shownRows.filter((r) => r.value === null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/rh/candidates"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-ink-2 hover:bg-surface-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Candidats
        </Link>
        <Badge variant="muted" className="text-xs">Pré-validé (hors candidature)</Badge>
      </div>

      <Card>
        <div className="p-4 flex items-start gap-4 flex-wrap">
          <NameAvatar name={fullName} className="h-14 w-14 text-base rounded-xl" />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{fullName}</h1>
              {isStudent === true ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-info-light text-info">
                  <GraduationCap className="h-3 w-3" /> Étudiant
                </span>
              ) : isStudent === false ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-light text-gold-dark">
                  <Briefcase className="h-3 w-3" /> Non-étudiant
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-ink-3">
                  Statut non déclaré
                </span>
              )}
            </div>
            <div className="text-xs text-ink-2 mt-1">
              Fiche créée le {c.created_at ? formatDateTime(c.created_at as string) : "—"}
              {tok?.completed_at ? (
                <span className="ml-2 inline-flex items-center gap-1 text-success font-bold">
                  <CheckCircle2 className="h-3 w-3" /> Dossier soumis le {formatDateTime(tok.completed_at)}
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center gap-1 text-warn font-bold">
                  <AlertCircle className="h-3 w-3" /> Pas encore soumis
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-ink">{filled}/{shownRows.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3">champs renseignés</div>
          </div>
        </div>

        <div className="border-t border-line p-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shownRows.map((r) => (
            <div key={r.label} className="bg-surface-2 rounded-md p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{r.label}</div>
              <div className={`text-sm font-semibold mt-0.5 ${r.value ? "" : "text-ink-3 italic font-normal"}`}>
                {r.value ?? "à compléter"}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {missing.length > 0 ? (
        <Card>
          <div className="p-4 text-sm">
            <div className="font-bold text-warn flex items-center gap-1.5 mb-1">
              <AlertCircle className="h-4 w-4" /> {missing.length} champ(s) encore à compléter par le candidat
            </div>
            <p className="text-ink-2">
              {missing.map((m) => m.label).join(" · ")}
            </p>
            {isStudent === true ? (
              <p className="text-[11px] text-ink-3 mt-2">
                Note : état civil et personnes à charge ne sont pas demandés à un étudiant (régime de précompte différent).
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Indisponibilités déclarées (base de planning) */}
      <Card>
        <div className="p-4">
          <div className="font-bold text-sm mb-2">Indisponibilités déclarées (3 prochains mois)</div>
          {unavail.length === 0 ? (
            <p className="text-sm text-ink-3 italic">Aucune indisponibilité déclarée pour l&apos;instant.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-1">🔁 Récurrentes</div>
                {recurringU.length === 0 ? (
                  <p className="text-xs text-ink-3">—</p>
                ) : (
                  <ul className="space-y-1">
                    {recurringU.map((u) => (
                      <li key={u.id} className="text-sm">
                        <b>{DOW_LONG[u.day_of_week ?? 0]}</b> · {slot(u.start_time, u.end_time)}
                        <span className="text-ink-3"> · {REASON_LBL[u.reason ?? ""] ?? u.reason ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-1">📅 Programmées</div>
                {specificU.length === 0 ? (
                  <p className="text-xs text-ink-3">—</p>
                ) : (
                  <ul className="space-y-1">
                    {specificU.map((u) => (
                      <li key={u.id} className="text-sm">
                        <b>{u.date_end ? `du ${u.date_specific ? formatDate(u.date_specific) : "—"} au ${formatDate(u.date_end)}` : (u.date_specific ? formatDate(u.date_specific) : "—")}</b> · {slot(u.start_time, u.end_time)}
                        <span className="text-ink-3"> · {REASON_LBL[u.reason ?? ""] ?? u.reason ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <p className="text-[11px] text-ink-3 mt-3">
            Ces contraintes seront automatiquement reprises dans le planning de l&apos;employé à l&apos;embauche.
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <div className="font-bold text-sm">Carte d&apos;identité (recto/verso, PDF)</div>
          {idCard ? (
            <>
              <span className="inline-flex items-center gap-1 text-success text-sm font-bold">
                <CheckCircle2 className="h-4 w-4" /> Fournie
              </span>
              {idCardUrl ? (
                <a href={idCardUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-ink text-white text-xs font-bold">
                  Voir / Télécharger le PDF
                </a>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-warn text-sm font-bold">
              <AlertCircle className="h-4 w-4" /> Pas encore fournie
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
