import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  CalendarDays,
  Printer,
  Award,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { tenureLabel, seniorTier, seniorTierLabel, nextAnniversary } from "@/lib/tenure";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployeeSiteNav } from "./employee-site-nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeAdminForm } from "./form";
import { SiteAssignmentsSection } from "./site-assignments";
import { DangerZone } from "./danger-zone";
import { EmployeeQuotaCard } from "./quota-card";
import { EmployeeAvailabilitySection } from "./availability-section";
import { InviteEmployeeButton } from "./invite-button";
import { ClearWeekButton } from "@/app/planning/calendar/clear-week-button";
import { startOfWeek, toISODate } from "@/lib/planning";

export default async function EmployeeDetailPage(props: PageProps<"/planning/employees/[id]">) {
  const { id } = await props.params;
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const [
    { data: emp },
    { data: depts },
    { data: managers },
    { data: sitesRaw },
    { data: assignsRaw },
  ] = await Promise.all([
    supabase.from("employees").select("*, department:departments(id, name)").eq("id", id).single(),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "rh", "manager"]).order("full_name"),
    supabase.from("sites").select("id, code, name, color").eq("is_active", true).order("sort_order"),
    supabase
      .from("site_assignments")
      .select("id, site_id, start_date, end_date, is_primary, pct, site:sites(id, code, name, color)")
      .eq("employee_id", id)
      .order("start_date", { ascending: false }),
  ]);
  const sites = (sitesRaw ?? []) as Array<{
    id: string; code: string; name: string; color: string | null;
  }>;
  const assignments = (assignsRaw ?? []) as unknown as Array<{
    id: string; site_id: string; start_date: string; end_date: string | null;
    is_primary: boolean; pct: number | null;
    site: { id: string; code: string; name: string; color: string | null } | null;
  }>;
  if (!emp) notFound();

  // Onboarding (best effort, ne pas casser la page si vide)
  const { data: runRaw } = await supabase
    .from("onboarding_runs")
    .select("id, started_at, completed_at")
    .eq("employee_id", id)
    .maybeSingle();
  const run = runRaw as unknown as { id: string; started_at: string; completed_at: string | null } | null;

  let onbDone = 0;
  let onbTotal = 0;
  if (run) {
    const { data: itemsData } = await supabase
      .from("onboarding_run_items")
      .select("id, done_at")
      .eq("run_id", run.id);
    const items = (itemsData ?? []) as unknown as Array<{ id: string; done_at: string | null }>;
    onbTotal = items.length;
    onbDone = items.filter((i) => i.done_at).length;
  }
  const onbPct = onbTotal === 0 ? 0 : Math.round((onbDone / onbTotal) * 100);

  // Dossier embauche : contrat le plus récent + Dimona la plus récente
  const [{ data: latestContractRaw }, { data: latestDimonaRaw }] = await Promise.all([
    supabase
      .from("employee_contracts")
      .select("id, status, contract_kind")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dimona_declarations")
      .select("id, status")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latestContract = latestContractRaw as
    | { id: string; status: "draft" | "ready_to_sign" | "signed" | "archived"; contract_kind: string }
    | null;
  const latestDimona = latestDimonaRaw as
    | { id: string; status: "pending" | "declared_onss" | "confirmed" | "rejected" }
    | null;
  const contractStatusLabel: Record<string, string> = {
    draft: "Brouillon",
    ready_to_sign: "Prêt à signer",
    signed: "Signé",
    archived: "Archivé",
  };
  const dimonaStatusLabel: Record<string, string> = {
    pending: "En attente",
    declared_onss: "Déclarée ONSS",
    confirmed: "Confirmée",
    rejected: "Rejetée",
  };

  return (
    <div className="space-y-4">
      <EmployeeSiteNav currentEmployeeId={id} basePath="" />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/planning/employees"><ArrowLeft className="h-3.5 w-3.5" /> Retour liste</Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          <InviteEmployeeButton
            employeeId={id}
            alreadyInvited={!!(emp as { profile_id: string | null }).profile_id}
          />
          <Button asChild variant="gold" size="sm">
            <Link href={`/planning/employees/${id}/contract`}>
              <FileText className="h-3.5 w-3.5" /> Contrat &amp; dossier
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/planning/employees/${id}/calendar?view=week`}>
              <CalendarDays className="h-3.5 w-3.5" /> Calendrier (sem/mois/année)
            </Link>
          </Button>
          {/* Karim 15/05 : Vider la semaine pour CET employe. Karim a signale
              que ce bouton manquait sur la fiche -- on l ajoute ici, scope
              automatique sur la semaine en cours. Pour vider une autre semaine,
              utiliser /planning/employees/[id]/calendar?view=week + nav. */}
          <ClearWeekButton
            weekISO={toISODate(startOfWeek(new Date()))}
            employeeId={id}
            scopeLabel="pour cet employé (semaine en cours)"
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`/planning/employees/${id}/print?weeks=4`} target="_blank">
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </Link>
          </Button>
        </div>
      </div>
      <Card>
        <div className="p-4 border-b border-line">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">{(emp as { full_name: string }).full_name}</h1>
            {(() => {
              const e = emp as unknown as {
                start_date: string | null;
                contract_type: string | null;
              };
              if (!e.start_date) return null;
              const tier = seniorTier(e.start_date, e.contract_type);
              const tierColor = {
                junior: "bg-gray-100 text-gray-700",
                confirme: "bg-blue-100 text-blue-700",
                senior: "bg-amber-100 text-amber-800",
                lead: "bg-purple-100 text-purple-800",
              }[tier];
              const anniv = nextAnniversary(e.start_date);
              return (
                <>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${tierColor}`}>
                    <Award className="h-3 w-3" /> {seniorTierLabel(tier)}
                  </span>
                  <span className="text-xs text-ink-3">
                    Ancienneté : <strong>{tenureLabel(e.start_date)}</strong>
                  </span>
                  {anniv ? (
                    <span className="text-xs text-ink-3">
                      · prochain anniv. {anniv.years} an{anniv.years > 1 ? "s" : ""} le{" "}
                      <strong>
                        {anniv.date.toLocaleDateString("fr-BE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </strong>
                    </span>
                  ) : null}
                </>
              );
            })()}
          </div>
          <p className="text-sm text-ink-2 mt-1">Édite tous les champs admin et les contraintes planning.</p>
        </div>
        <div className="p-5">
          <EmployeeAdminForm
            employee={emp as never}
            departments={depts ?? []}
            managers={managers ?? []}
            sites={sites}
          />
        </div>
      </Card>

      <EmployeeQuotaCard employeeId={id} />

      <EmployeeAvailabilitySection
        employeeId={id}
        fixedOffDays={(emp as { fixed_off_days: number[] | null }).fixed_off_days}
      />

      <SiteAssignmentsSection
        employeeId={id}
        assignments={assignments}
        sites={sites}
      />

      <DangerZone
        employeeId={id}
        fullName={(emp as { full_name: string }).full_name}
        status={(emp as { status: string }).status}
        isAdmin={profile.role === "admin"}
      />

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Dossier d&apos;embauche</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Génération contrat + Dimona ONSS + onboarding self-service.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line">
          <Link
            href={`/planning/employees/${id}/contract`}
            className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
          >
            <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Contrat</div>
              <div className="text-xs text-ink-3">
                {latestContract
                  ? `${latestContract.contract_kind} · ${contractStatusLabel[latestContract.status] ?? latestContract.status}`
                  : "Aucun contrat préparé"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-3" />
          </Link>
          <Link
            href={`/planning/employees/${id}/dimona`}
            className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
          >
            <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Dimona</div>
              <div className="text-xs text-ink-3">
                {latestDimona
                  ? dimonaStatusLabel[latestDimona.status] ?? latestDimona.status
                  : "Non déclarée"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-3" />
          </Link>
          <Link
            href={`/onboarding/${id}`}
            className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
          >
            <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Onboarding</div>
              <div className="text-xs text-ink-3">
                {run ? `${onbDone}/${onbTotal} items · ${onbPct}%` : "Pas démarré"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-3" />
          </Link>
        </div>
      </Card>

      <Card>
        <Link
          href={`/onboarding/${id}`}
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Onboarding</div>
            {run ? (
              <>
                <div className="text-xs text-ink-3">
                  {run.completed_at
                    ? `Terminé · ${onbDone}/${onbTotal} items`
                    : `${onbDone}/${onbTotal} items réalisés`}
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={onbPct >= 100 ? "h-full bg-success" : onbPct >= 50 ? "h-full bg-gold" : "h-full bg-warn"}
                    style={{ width: `${Math.min(100, onbPct)}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-xs text-ink-3">Aucun parcours d'onboarding démarré.</div>
            )}
          </div>
          <span className="font-mono font-extrabold text-sm text-ink-2 hidden md:inline">{onbPct}%</span>
          <ArrowRight className="h-4 w-4 text-ink-3" />
        </Link>
      </Card>
    </div>
  );
}
