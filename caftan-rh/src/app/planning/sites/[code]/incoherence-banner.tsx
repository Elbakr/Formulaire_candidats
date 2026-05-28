// Karim 2026-05-22 : refacto pour mutualiser les queries. Reçoit les donnees
// en props (1 chargement parent au lieu de 3 queries propres).

import Link from "next/link";
import { AlertTriangle, Users, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { SiteAnalyticsData } from "@/app/planning/employees/[id]/calendar/site-analytics-loader";

export function SiteIncoherenceBanner({
  data,
  siteCode,
  weekStart,
}: {
  data: SiteAnalyticsData;
  siteCode: string;
  weekStart: string;
}) {
  const memberIds = data.memberIds;
  const memberNames = new Map(data.members.map((e) => [e.id, e.full_name] as const));
  const onSite = data.shiftsOnSite;
  const memberShiftsElsewhere = data.shiftsElsewhereForMembers;

  // Cas A : renforts cross-site (shift sur ce site mais l employe n est pas membre)
  const renforts = new Map<string, { name: string; shifts: typeof onSite }>();
  for (const s of onSite) {
    if (memberIds.has(s.employee_id)) continue;
    const k = s.employee_id;
    const existing = renforts.get(k);
    if (existing) existing.shifts.push(s);
    else renforts.set(k, { name: s.full_name ?? "?", shifts: [s] });
  }

  // Cas B : membres sans shift sur ce site cette semaine mais avec shifts ailleurs
  const empWithShiftOnSite = new Set(onSite.map((s) => s.employee_id));
  const elsewhereByEmp = new Map<string, typeof memberShiftsElsewhere>();
  for (const s of memberShiftsElsewhere) {
    const arr = elsewhereByEmp.get(s.employee_id) ?? [];
    arr.push(s);
    elsewhereByEmp.set(s.employee_id, arr);
  }
  const missingMembers: Array<{ employee_id: string; name: string; shifts: typeof memberShiftsElsewhere }> = [];
  for (const empId of memberIds) {
    if (empWithShiftOnSite.has(empId)) continue;
    const elsewhereShifts = elsewhereByEmp.get(empId) ?? [];
    if (elsewhereShifts.length > 0) {
      missingMembers.push({
        employee_id: empId,
        name: memberNames.get(empId) ?? "?",
        shifts: elsewhereShifts,
      });
    }
  }

  if (renforts.size === 0 && missingMembers.length === 0) return null;

  return (
    <Card className="border-warn/40 bg-warn-light/30">
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-warn font-bold text-sm">
          <AlertTriangle className="h-4 w-4" />
          Incohérences détectées sur le site {siteCode} cette semaine
          <span className="text-[10px] text-ink-3 font-normal ml-2">
            ({memberIds.size} membres officiels)
          </span>
        </div>

        {renforts.size > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
              <Users className="h-3 w-3" /> Renforts non-affectés ({renforts.size})
            </div>
            <p className="text-[11px] text-ink-2 mb-1">
              Ces employés ont des shifts <strong>sur ce site</strong> mais ne sont{" "}
              <strong>PAS membres officiels</strong> du site. Le solver les a piochés en renfort cross-site.
            </p>
            <ul className="space-y-1 text-xs">
              {[...renforts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([empId, info]) => (
                <li key={empId} className="flex items-center gap-2 flex-wrap">
                  <Link href={`/planning/employees/${empId}/calendar?date=${weekStart}`} className="font-bold hover:text-gold-dark">
                    {info.name}
                  </Link>
                  <span className="text-ink-3">
                    {info.shifts.length} shift{info.shifts.length > 1 ? "s" : ""} sur ce site
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {missingMembers.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Fausses présences ({missingMembers.length})
            </div>
            <p className="text-[11px] text-ink-2 mb-1">
              Ces membres sont affichés comme membres du site, mais{" "}
              <strong>ne travaillent pas ici</strong> cette semaine. Ils ont des shifts ailleurs.
            </p>
            <ul className="space-y-1 text-xs">
              {missingMembers.sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
                const sitesElsewhere = [...new Set(m.shifts.map((s) => s.site_code ?? "?"))];
                return (
                  <li key={m.employee_id} className="flex items-center gap-2 flex-wrap">
                    <Link href={`/planning/employees/${m.employee_id}/calendar?date=${weekStart}`} className="font-bold hover:text-gold-dark">
                      {m.name}
                    </Link>
                    <span className="text-ink-3">
                      {m.shifts.length} shift{m.shifts.length > 1 ? "s" : ""} sur :{" "}
                      {sitesElsewhere.map((c) => (
                        <span key={c} className="inline-block bg-surface px-1 rounded font-mono text-[10px] mr-0.5">{c}</span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
