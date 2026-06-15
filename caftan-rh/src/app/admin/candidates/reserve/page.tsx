import Link from "next/link";
import { Archive, Eye, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate, formatDateTime } from "@/lib/utils";
import { computeCandidateScoreDetailed } from "@/lib/candidate-scoring";
import { VivierActionsButtons } from "./vivier-actions-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type VivierRow = {
  id: string; // pre_interview.id
  application_id: string;
  position_role: string;
  reviewed_at: string | null;
  decision_note: string | null;
  application: {
    created_at: string;
    status: string;
    candidate: {
      full_name: string;
      email: string;
      phone: string | null;
      city: string | null;
      birth_date: string | null;
      nrn: string | null;
      iban: string | null;
      address: string | null;
      postal_code: string | null;
      motivation: string | null;
      available_from: string | null;
      wanted_contract_type: string | null;
      langs: Record<string, string> | null;
      raw_payload: Record<string, unknown> | null;
      applied_at: string | null;
      distance_km: number | null;
    } | null;
    job: { title: string | null } | null;
  } | null;
};

export default async function VivierPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pre_interviews")
    .select(
      `id,
       application_id,
       position_role,
       reviewed_at,
       decision_note,
       application:applications!inner(
         created_at,
         status,
         candidate:candidates(
           full_name, email, phone, city, birth_date, nrn, iban,
           address, postal_code, motivation, available_from,
           wanted_contract_type, langs, raw_payload, applied_at, distance_km
         ),
         job:jobs(title)
       )`,
    )
    .eq("decision", "reserve")
    .order("reviewed_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="p-8 text-center text-danger text-sm font-semibold">
        Erreur lors du chargement du vivier : {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as unknown as VivierRow[];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-5 w-5 text-gold-dark" />
            Vivier de candidats
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            {rows.length} candidat{rows.length !== 1 ? "s" : ""} mis en réserve après pré-entretien.
            Relancez ou rejetez chaque profil en 1 clic.
          </p>
        </div>
      </div>

      {/* Tableau / liste */}
      <Card>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-3 italic">
            Le vivier est vide — aucun candidat en décision « réserve » pour l&apos;instant.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const cand = row.application?.candidate;
              const job = row.application?.job;
              const appCreatedAt = row.application?.created_at ?? null;

              // Score IA (heuristique — calcul côté serveur)
              let score: number | null = null;
              if (cand) {
                try {
                  const result = computeCandidateScoreDetailed({
                    email: cand.email,
                    phone: cand.phone,
                    birth_date: cand.birth_date,
                    city: cand.city,
                    address: cand.address,
                    postal_code: cand.postal_code,
                    nrn: cand.nrn,
                    iban: cand.iban,
                    motivation: cand.motivation,
                    available_from: cand.available_from,
                    wanted_contract_type: cand.wanted_contract_type,
                    langs: cand.langs,
                    raw_payload: cand.raw_payload,
                    applied_at: cand.applied_at,
                    closest_site_distance_km: cand.distance_km,
                  });
                  score = result.total;
                } catch {
                  score = null;
                }
              }

              const scoreTone =
                score === null
                  ? "text-ink-3"
                  : score >= 65
                    ? "text-success font-bold"
                    : score >= 45
                      ? "text-gold-dark font-bold"
                      : "text-danger font-bold";

              return (
                <li
                  key={row.id}
                  className="p-3 sm:p-4 flex items-center gap-3 flex-wrap hover:bg-surface-2 transition-colors"
                >
                  {/* Avatar + infos candidat */}
                  <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                    {cand ? (
                      <NameAvatar name={cand.full_name} />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-line shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">
                        {cand?.full_name ?? "Candidat inconnu"}
                      </div>
                      <div className="text-xs text-ink-3 truncate">
                        {cand?.email ?? "—"}
                        {cand?.city ? <span> · {cand.city}</span> : null}
                      </div>
                      <div className="text-[11px] text-ink-3 mt-0.5 flex flex-wrap gap-x-2">
                        <span>
                          Poste : <span className="font-semibold">{job?.title ?? row.position_role}</span>
                        </span>
                        {appCreatedAt ? (
                          <span>
                            Candidature : {formatDate(appCreatedAt)}
                          </span>
                        ) : null}
                        {row.reviewed_at ? (
                          <span>
                            Mise en réserve : {formatDateTime(row.reviewed_at)}
                          </span>
                        ) : null}
                        {row.decision_note ? (
                          <span className="text-ink-2 italic">
                            « {row.decision_note} »
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Score IA */}
                  <div className="text-center w-16 shrink-0">
                    {score !== null ? (
                      <>
                        <div className={`text-xl font-extrabold font-mono ${scoreTone}`}>
                          {score}
                        </div>
                        <div className="text-[10px] text-ink-3 uppercase tracking-wider">/ 100</div>
                      </>
                    ) : (
                      <div className="text-xs text-ink-3 italic">—</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {/* Voir la fiche */}
                    <Button asChild size="sm" variant="outline" title="Voir la fiche candidat">
                      <Link href={`/rh/candidates/${row.application_id}?tab=pre-interview`}>
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Fiche</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>

                    {/* Relancer / Rejeter (actions 1-clic) */}
                    {cand ? (
                      <VivierActionsButtons
                        preInterviewId={row.id}
                        applicationId={row.application_id}
                        candidateName={cand.full_name}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
