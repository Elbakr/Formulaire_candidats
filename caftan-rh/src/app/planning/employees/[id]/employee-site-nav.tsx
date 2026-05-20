// Server component : strip de navigation entre employés. Affiche d abord
// les collegues du MEME site primary, puis les employes des autres sites
// regroupes par site. Permet a Karim de naviguer fluidement entre fiches
// sans repasser par /planning/employees.

import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export async function EmployeeSiteNav({
  currentEmployeeId,
  basePath = "calendar", // ou "" pour la fiche
}: {
  currentEmployeeId: string;
  /** Suffixe d URL apres /planning/employees/[id]/ : 'calendar' ou '' */
  basePath?: string;
}) {
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  const [{ data: empsRaw }, { data: assignsRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("site_assignments")
      .select("employee_id, site_id, is_primary")
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`)
      .order("is_primary", { ascending: false }),
    supabase
      .from("sites")
      .select("id, code, name, color, abbr")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const emps = (empsRaw ?? []) as Array<{ id: string; full_name: string; status: string }>;
  const assigns = (assignsRaw ?? []) as Array<{ employee_id: string; site_id: string; is_primary: boolean }>;
  const sites = (sitesRaw ?? []) as Array<{ id: string; code: string; name: string; color: string | null; abbr: string | null }>;

  // 1er site primary par employe (assigns deja trie is_primary DESC)
  const primarySiteByEmp = new Map<string, string>();
  for (const a of assigns) {
    if (!primarySiteByEmp.has(a.employee_id)) primarySiteByEmp.set(a.employee_id, a.site_id);
  }

  // Employes groupes par site
  const empsBySite = new Map<string, typeof emps>();
  const empsNoSite: typeof emps = [];
  for (const e of emps) {
    const sid = primarySiteByEmp.get(e.id);
    if (!sid) {
      empsNoSite.push(e);
      continue;
    }
    const arr = empsBySite.get(sid) ?? [];
    arr.push(e);
    empsBySite.set(sid, arr);
  }

  const currentSiteId = primarySiteByEmp.get(currentEmployeeId);
  const currentSite = currentSiteId ? sites.find((s) => s.id === currentSiteId) : null;
  const sameSiteEmps = currentSiteId ? (empsBySite.get(currentSiteId) ?? []) : [];

  // Prev / Next dans le meme site
  const idxInSite = sameSiteEmps.findIndex((e) => e.id === currentEmployeeId);
  const prevSameSite = idxInSite > 0 ? sameSiteEmps[idxInSite - 1] : null;
  const nextSameSite = idxInSite >= 0 && idxInSite < sameSiteEmps.length - 1 ? sameSiteEmps[idxInSite + 1] : null;

  // Sites suivants (par sort_order, en excluant le site courant)
  const otherSites = sites.filter((s) => s.id !== currentSiteId);

  const suffix = basePath ? `/${basePath}` : "";

  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-2 space-y-2">
      {/* Ligne 1 : prev/next same site */}
      {currentSite ? (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1 text-ink-3 font-bold">
            <span
              className="inline-flex items-center justify-center h-5 w-5 rounded text-white font-bold text-[10px]"
              style={{ backgroundColor: currentSite.color ?? "#666" }}
            >
              {currentSite.abbr ?? currentSite.code}
            </span>
            {currentSite.name} · {sameSiteEmps.length} employé{sameSiteEmps.length > 1 ? "s" : ""}
          </span>
          {prevSameSite ? (
            <Link
              href={`/planning/employees/${prevSameSite.id}${suffix}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-line hover:bg-surface text-[11px]"
              title={`Précédent : ${prevSameSite.full_name}`}
            >
              <ChevronLeft className="h-3 w-3" /> {prevSameSite.full_name}
            </Link>
          ) : null}
          {nextSameSite ? (
            <Link
              href={`/planning/employees/${nextSameSite.id}${suffix}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-line hover:bg-surface text-[11px]"
              title={`Suivant : ${nextSameSite.full_name}`}
            >
              {nextSameSite.full_name} <ChevronRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Ligne 2 : strip collegues du même site (max 12, sinon scrollable) */}
      {sameSiteEmps.length > 1 ? (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <span className="text-[10px] uppercase tracking-wider text-ink-3 font-bold shrink-0 mr-1">
            <Users className="h-3 w-3 inline" /> Collègues
          </span>
          {sameSiteEmps.map((e) => {
            const isCurrent = e.id === currentEmployeeId;
            return (
              <Link
                key={e.id}
                href={`/planning/employees/${e.id}${suffix}`}
                className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  isCurrent ? "bg-gold text-[#1a1a0d]" : "bg-surface border border-line hover:bg-surface-2"
                }`}
              >
                {e.full_name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Ligne 3 : sites suivants - chacun affiche un strip de leurs employes */}
      <details className="text-xs">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-ink-3 font-bold hover:text-ink">
          Autres sites ({otherSites.length})
        </summary>
        <div className="mt-1.5 space-y-1">
          {otherSites.map((site) => {
            const siteEmps = empsBySite.get(site.id) ?? [];
            if (siteEmps.length === 0) return null;
            return (
              <div key={site.id} className="flex items-center gap-1 overflow-x-auto pb-1">
                <span className="shrink-0 inline-flex items-center gap-1 mr-1">
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded text-white font-bold text-[10px]"
                    style={{ backgroundColor: site.color ?? "#666" }}
                  >
                    {site.abbr ?? site.code}
                  </span>
                  <span className="text-[10px] font-bold text-ink-2">{site.name}</span>
                </span>
                {siteEmps.map((e) => (
                  <Link
                    key={e.id}
                    href={`/planning/employees/${e.id}${suffix}`}
                    className="shrink-0 px-2 py-0.5 rounded text-[11px] bg-surface border border-line hover:bg-surface-2 hover:text-gold-dark"
                  >
                    {e.full_name}
                  </Link>
                ))}
              </div>
            );
          })}
          {empsNoSite.length > 0 ? (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <span className="text-[10px] font-bold text-warn shrink-0 mr-1">Sans site</span>
              {empsNoSite.map((e) => (
                <Link
                  key={e.id}
                  href={`/planning/employees/${e.id}${suffix}`}
                  className="shrink-0 px-2 py-0.5 rounded text-[11px] bg-surface border border-warn/40 hover:bg-warn-light"
                >
                  {e.full_name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
