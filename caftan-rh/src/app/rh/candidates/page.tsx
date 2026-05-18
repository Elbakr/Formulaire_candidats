import Link from "next/link";
import { fetchApplications, fetchOpenJobs } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { CandidatesTable } from "./candidates-table";
import { NewCandidateButton } from "./new-candidate-button";
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
          <NewCandidateButton jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
        </div>
      </div>
      <CandidatesTable initialData={apps} templates={(tmpls ?? []) as never} />
    </div>
  );
}
