// Server component : detecte les shifts d un employe dont le site_id ne
// correspond pas a ses site_assignments actifs. Karim 20/05 : Ibtissem est
// assignee a D mais a 8 shifts a B (renfort cross-site mal cadre).

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export async function EmployeeIncoherenceBanner({
  employeeId,
  weekStart,
  weekEnd,
}: {
  employeeId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const supabase = await createClient();

  const [{ data: assignsRaw }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("site_assignments")
      .select("site_id, is_primary, start_date, end_date, site:sites(code, name)")
      .eq("employee_id", employeeId),
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, site_id, site:sites(code, name)")
      .eq("employee_id", employeeId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date"),
  ]);

  type A = {
    site_id: string;
    is_primary: boolean;
    start_date: string;
    end_date: string | null;
    site: { code: string; name: string } | null;
  };
  type S = {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    site_id: string | null;
    site: { code: string; name: string } | null;
  };
  const assigns = ((assignsRaw ?? []) as unknown as A[]);
  const shifts = ((shiftsRaw ?? []) as unknown as S[]);

  function activeAtDate(dateISO: string): A[] {
    return assigns.filter(
      (a) =>
        a.start_date <= dateISO &&
        (a.end_date == null || a.end_date >= dateISO),
    );
  }

  const mismatches: Array<{ shift: S; activeCodes: string[] }> = [];
  for (const s of shifts) {
    if (!s.site_id) continue; // shifts sans site_id traites a part
    const active = activeAtDate(s.date);
    const codes = active.map((a) => a.site?.code).filter(Boolean) as string[];
    if (active.length === 0) {
      mismatches.push({ shift: s, activeCodes: [] });
    } else if (!active.some((a) => a.site_id === s.site_id)) {
      mismatches.push({ shift: s, activeCodes: codes });
    }
  }
  const noSite = shifts.filter((s) => s.site_id == null);

  if (mismatches.length === 0 && noSite.length === 0) return null;

  return (
    <Card className="border-warn/40 bg-warn-light/30">
      <div className="p-3">
        <div className="flex items-center gap-2 text-warn font-bold text-sm mb-2">
          <AlertTriangle className="h-4 w-4" />
          Incohérences sur les shifts de la semaine
        </div>
        {mismatches.length > 0 ? (
          <div className="mb-2">
            <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3">
              Site du shift ≠ site d'affectation ({mismatches.length})
            </div>
            <p className="text-[11px] text-ink-2 mb-1">
              Ces shifts ont été créés sur un site où l'employé n'est{" "}
              <strong>pas affecté</strong> (renfort cross-site par le solver).
              Sa fiche affiche ce site, alors qu'officiellement il devrait être
              sur :{" "}
              {[...new Set(mismatches.flatMap((m) => m.activeCodes))].length > 0 ? (
                <span className="font-mono">
                  {[...new Set(mismatches.flatMap((m) => m.activeCodes))].join(", ")}
                </span>
              ) : (
                <em>aucun site affecté</em>
              )}
              .
            </p>
            <ul className="space-y-0.5 text-xs">
              {mismatches.map(({ shift, activeCodes }) => (
                <li key={shift.id} className="font-mono">
                  {shift.date} {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)} →
                  <span className="bg-danger-light text-danger px-1 rounded mx-1">
                    {shift.site?.code ?? "?"}
                  </span>
                  <span className="text-ink-3">au lieu de</span>
                  <span className="bg-success-light text-success px-1 rounded mx-1">
                    {activeCodes.length > 0 ? activeCodes.join("/") : "—"}
                  </span>
                  <Link
                    href={`/planning/sites/${shift.site?.code}`}
                    className="text-[10px] underline text-ink-3 ml-1"
                  >
                    voir site
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {noSite.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3">
              Shifts sans site_id ({noSite.length})
            </div>
            <p className="text-[11px] text-ink-2 mb-1">
              Ces shifts n'ont pas de site assigné. Édite-les pour préciser le
              site.
            </p>
            <ul className="space-y-0.5 text-xs">
              {noSite.map((s) => (
                <li key={s.id} className="font-mono">
                  {s.date} {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
