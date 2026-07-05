import Link from "next/link";
import { fetchApplications, fetchOpenJobs } from "@/lib/queries";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { CandidatesTable } from "./candidates-table";
import { NewCandidateButton } from "./new-candidate-button";
import { PrevalidatedLinkButton } from "./prevalidated-link-button";
import { ExportCandidatesButton } from "./export-button";
import { GfSyncButton } from "@/app/admin/integrations/gravity-forms/sync-button";
import { formatDateTime } from "@/lib/utils";

// Karim 18/05 : la liste candidats etait stale (cachee a la 1ere visite).
// Force-dynamic + revalidate=0 garantit que chaque load relit les data
// fraiches, indispensable apres un sync GF (sinon les nouveaux candidats
// du jour ne remontent pas sans Ctrl+F5 manuel).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RhCandidatesPage() {
  const supabase = await createClient();
  const [apps, jobs, { data: tmpls }, { data: gfSettings }] = await Promise.all([
    fetchApplications(),
    fetchOpenJobs(),
    supabase
      .from("email_templates")
      .select("slug, label, subject, body_html, needs_dates, needs_times")
      .eq("is_active", true)
      .order("label"),
    supabase
      .from("gf_settings")
      .select("enabled, ck, cs, last_synced_at, last_sync_count")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const gf = (gfSettings ?? null) as {
    enabled: boolean;
    ck: string | null;
    cs: string | null;
    last_synced_at: string | null;
    last_sync_count: number;
  } | null;
  const gfReady = !!(gf?.enabled && gf?.ck && gf?.cs);

  // Karim 2026-07-05 : les candidats PRÉ-VALIDÉS (lien de pré-embauche) vivent
  // dans `candidates.prevalidated = true` et n'ont PAS de candidature -> ils
  // n'apparaissaient nulle part et étaient introuvables. On les liste ici, avec
  // le statut du lien (envoyé / dossier soumis) pour pouvoir les retrouver et les
  // ouvrir (/rh/candidates/prevalidated/[id]).
  const admin = createAdminClient();
  const { data: prevalRaw } = await admin
    .from("candidates")
    .select("id, full_name, email, created_at, is_student")
    .eq("prevalidated", true)
    .order("created_at", { ascending: false });
  const preval = (prevalRaw ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    created_at: string | null;
    is_student: boolean | null;
  }>;
  const tokMap = new Map<string, { sent_at: string | null; completed_at: string | null }>();
  if (preval.length > 0) {
    const { data: toks } = await admin
      .from("contract_info_tokens")
      .select("candidate_id, sent_at, completed_at, created_at")
      .in("candidate_id", preval.map((p) => p.id))
      .order("created_at", { ascending: true });
    // Le tri ascendant + set successifs -> on garde le token le plus RÉCENT par candidat.
    for (const t of (toks ?? []) as Array<{ candidate_id: string; sent_at: string | null; completed_at: string | null }>) {
      tokMap.set(t.candidate_id, { sent_at: t.sent_at, completed_at: t.completed_at });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Candidats</h1>
          <p className="text-sm text-ink-2">
            {apps.length} candidatures · sélectionne plusieurs candidats pour envoyer un email en masse.
            {gf?.last_synced_at ? (
              <>
                {" · "}
                <span className="text-[11px] text-ink-3">
                  Dernière sync Gravity Forms : {formatDateTime(gf.last_synced_at)} ({gf.last_sync_count} entrée
                  {gf.last_sync_count > 1 ? "s" : ""})
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/rh/top-candidates"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gold text-[#1a1a0d] hover:bg-gold-dark font-bold text-sm"
            title="Top profils : classement intelligent par match_score"
          >
            ✨ Top profils
          </Link>
          {gfReady ? (
            <GfSyncButton disabled={false} />
          ) : (
            <Link
              href="/admin/integrations/gravity-forms"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-warn text-warn hover:bg-warn-light text-xs font-bold"
              title="L intégration Gravity Forms n est pas configurée. Va dans Admin > Intégrations > Gravity Forms."
            >
              Configurer Gravity Forms →
            </Link>
          )}
          <ExportCandidatesButton />
          <PrevalidatedLinkButton />
          <NewCandidateButton jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
        </div>
      </div>

      {preval.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-sm">
              Candidats pré-validés{" "}
              <span className="text-ink-3 font-normal">({preval.length})</span>
            </h2>
            <span className="text-[11px] text-ink-3">
              Liens de pré-embauche · le candidat remplit lui-même son dossier
            </span>
          </div>
          <ul className="divide-y divide-line">
            {preval.map((p) => {
              const st = tokMap.get(p.id);
              return (
                <li key={p.id}>
                  <Link
                    href={`/rh/candidates/prevalidated/${p.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">
                        {p.full_name || "Candidat pré-validé"}
                        {p.is_student === true ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-info">étudiant</span>
                        ) : p.is_student === false ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-dark">non-étudiant</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-ink-3 truncate">
                        {p.email || "sans email"}
                        {p.created_at ? <> · créé le {formatDateTime(p.created_at)}</> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {st?.completed_at ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-light text-success">Dossier soumis</span>
                      ) : st?.sent_at ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-info-light text-info">Lien envoyé</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn-light text-warn">Lien non envoyé</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <CandidatesTable initialData={apps} templates={(tmpls ?? []) as never} />
    </div>
  );
}
