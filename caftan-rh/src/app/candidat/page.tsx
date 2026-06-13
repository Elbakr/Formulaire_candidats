import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPin, Briefcase, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchOpenJobs } from "@/lib/queries";
import { ErasureButton } from "./erasure-button";

export const dynamic = "force-dynamic";

// Libellés candidat-friendly du pipeline (inclut les statuts étendus pré-entretien).
const STATUS_FR: Record<string, { label: string; cls: string }> = {
  new: { label: "Reçue", cls: "bg-info-light text-info" },
  contacted: { label: "Contacté", cls: "bg-info-light text-info" },
  pre_interview_sent: { label: "Pré-entretien à compléter", cls: "bg-warn-light text-warn" },
  pre_interview_done: { label: "Pré-entretien reçu", cls: "bg-violet-light text-violet" },
  shortlistable: { label: "Présélectionné", cls: "bg-violet-light text-violet" },
  rdv_scheduled: { label: "Entretien planifié", cls: "bg-violet-light text-violet" },
  rdv_done: { label: "Entretien passé", cls: "bg-violet-light text-violet" },
  wait_decision: { label: "En cours de décision", cls: "bg-warn-light text-warn" },
  hired: { label: "Embauché·e 🎉", cls: "bg-success-light text-success" },
  refused: { label: "Non retenue", cls: "bg-surface-2 text-ink-3" },
};

function statusChip(status: string) {
  return STATUS_FR[status] ?? { label: status, cls: "bg-surface-2 text-ink-2" };
}

export default async function CandidatHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/candidat/login?next=/candidat");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const firstName = (profile?.full_name ?? "").split(/\s+/)[0] ?? "";

  // Mes candidatures : candidats rattachés à mon compte → applications.
  const { data: myCands } = await supabase
    .from("candidates")
    .select("id")
    .eq("profile_id", user.id);
  const candIds = ((myCands ?? []) as Array<{ id: string }>).map((c) => c.id);

  let apps: Array<{
    id: string; status: string; created_at: string;
    job: { title: string } | { title: string }[] | null;
  }> = [];
  if (candIds.length > 0) {
    const { data } = await supabase
      .from("applications")
      .select("id, status, created_at, job:jobs(title)")
      .in("candidate_id", candIds)
      .order("created_at", { ascending: false });
    apps = (data ?? []) as typeof apps;
  }

  const jobs = await fetchOpenJobs();

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Bonjour {firstName} 👋</h1>
        <p className="text-sm text-ink-2 mt-1">
          Bienvenue dans ton espace candidat. Consulte les offres et suis tes candidatures ici.
        </p>
      </div>

      {/* Mes candidatures */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3 mb-2">Mes candidatures</h2>
        {apps.length === 0 ? (
          <div className="rounded-xl bg-surface border border-line p-5 text-center">
            <FileText className="h-7 w-7 text-ink-3 mx-auto mb-2" />
            <p className="text-sm text-ink-2">Tu n'as pas encore postulé. Choisis une offre ci-dessous.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {apps.map((a) => {
              const job = Array.isArray(a.job) ? a.job[0] : a.job;
              const chip = statusChip(a.status);
              return (
                <div key={a.id} className="rounded-xl bg-surface border border-line p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{job?.title ?? "Candidature spontanée"}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Envoyée le {new Date(a.created_at).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Offres ouvertes */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3 mb-2">Offres ouvertes</h2>
        <div className="space-y-2">
          {jobs.length === 0 ? (
            <div className="rounded-xl bg-surface border border-line p-5 text-center">
              <p className="text-sm text-ink-2">Aucune offre ouverte pour l'instant.</p>
            </div>
          ) : (
            jobs.map((j) => {
              const dept = (j.department as { name?: string } | null)?.name;
              return (
                <Link
                  key={j.id}
                  href={`/postuler/${j.id}`}
                  className="block rounded-xl bg-surface border border-line p-4 hover:border-gold transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{j.title}</div>
                      <div className="text-[11px] text-ink-2 mt-0.5 flex flex-wrap gap-2">
                        {dept ? <span>{dept}</span> : null}
                        {j.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</span> : null}
                        {j.contract_type ? <span className="rounded-full bg-gold-light text-gold-dark px-2 py-0.5 font-bold uppercase tracking-wider text-[10px]">{j.contract_type}</span> : null}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3 shrink-0" />
                  </div>
                </Link>
              );
            })
          )}
          <Link
            href="/postuler/spontanee"
            className="block rounded-xl bg-surface-2 border border-dashed border-line p-4 hover:border-gold hover:bg-surface transition-colors text-center"
          >
            <div className="text-sm font-bold">Candidature spontanée</div>
            <div className="text-[11px] text-ink-3 mt-0.5">Tu ne trouves pas l'offre ? Envoie quand même ton profil.</div>
          </Link>
        </div>
      </section>

      {/* Droit à l'effacement RGPD */}
      <div className="pt-2 text-center">
        <ErasureButton />
      </div>
    </div>
  );
}
