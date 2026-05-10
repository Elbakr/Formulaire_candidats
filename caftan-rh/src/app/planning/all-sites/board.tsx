"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { addDays, parseISODate, toISODate, DAY_LABELS } from "@/lib/planning";

export type AllSitesSite = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  light_color: string | null;
  abbr: string | null;
};

export type AllSitesShift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
  location: string | null;
  site_id: string | null;
  is_overtime?: boolean | null;
  overtime_multiplier?: number | null;
  employee: { id: string; full_name: string; job_title: string | null } | null;
};

const FILTERS = [
  { value: "all", label: "Tous" },
  { value: "vendeur", label: "Vendeurs" },
  { value: "logistique", label: "Logistique" },
  { value: "online", label: "Online" },
];

function shiftMatchesFilter(s: AllSitesShift, filter: string): boolean {
  if (filter === "all") return true;
  const haystack = `${s.position ?? ""} ${s.employee?.job_title ?? ""}`.toLowerCase();
  return haystack.includes(filter);
}

export function AllSitesBoard({
  mondayISO,
  sites,
  shifts,
  initialFilter,
}: {
  mondayISO: string;
  sites: AllSitesSite[];
  shifts: AllSitesShift[];
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState<string>(initialFilter ?? "all");
  const [activeDay, setActiveDay] = useState<number>(() => {
    // Sur mobile : par défaut on affiche le jour d'aujourd'hui s'il fait
    // partie de la semaine, sinon lundi.
    const todayISO = toISODate(new Date());
    const monday = parseISODate(mondayISO);
    for (let i = 0; i < 7; i++) {
      if (toISODate(addDays(monday, i)) === todayISO) return i;
    }
    return 0;
  });

  const monday = useMemo(() => parseISODate(mondayISO), [mondayISO]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [mondayISO],
  );

  const filteredShifts = useMemo(
    () => shifts.filter((s) => shiftMatchesFilter(s, filter)),
    [shifts, filter],
  );

  // Index : Map<`${siteId}|${dateISO}`, AllSitesShift[]>
  const grid = useMemo(() => {
    const m = new Map<string, AllSitesShift[]>();
    for (const s of filteredShifts) {
      if (!s.site_id) continue;
      const key = `${s.site_id}|${s.date}`;
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [filteredShifts]);

  function shiftsFor(siteId: string, dISO: string): AllSitesShift[] {
    return grid.get(`${siteId}|${dISO}`) ?? [];
  }

  function doPrint() {
    window.print();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface text-xs">
          <Filter className="h-3 w-3 ml-2 text-ink-3" />
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 font-bold transition-colors ${
                filter === f.value
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-ink-2 hover:bg-surface-2"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={doPrint}>
          <Printer className="h-3.5 w-3.5" /> Imprimer la vue
        </Button>
      </div>

      {sites.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun magasin actif.{" "}
            <Link href="/admin/sites" className="text-gold-dark font-bold hover:underline">
              Configurer les sites
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile : tabs jour. Desktop : grille complète. */}
          <div className="md:hidden flex overflow-x-auto scroll-smooth-touch border border-line rounded-md bg-surface">
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => setActiveDay(i)}
                className={`flex-1 min-w-[60px] px-2 py-2 text-[11px] font-bold uppercase border-r border-line last:border-r-0 transition-colors ${
                  activeDay === i ? "bg-gold text-[#1a1a0d]" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <div>{DAY_LABELS[i]}</div>
                <div className="text-[9px] text-ink-3 font-mono">{d.getDate()}</div>
              </button>
            ))}
          </div>

          {/* Desktop : grille fixe sites × jours. Mobile : 1 colonne par site, 1 ligne (le jour actif).
              `overscroll-x-contain` pour ne pas voler le scroll vertical de la page (bug souris/clavier). */}
          <div className="overflow-x-auto overscroll-x-contain -mx-2 px-2 pb-2">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `120px repeat(${sites.length}, minmax(220px, 1fr))`,
              }}
            >
              {/* Header : "Jour" + 1 cellule par site */}
              <div className="hidden md:flex items-end px-2 pb-2 text-[10px] uppercase tracking-wider font-bold text-ink-3">
                Jour
              </div>
              {sites.map((site) => (
                <div
                  key={`hdr-${site.id}`}
                  className="hidden md:flex items-center gap-2 px-3 py-2 rounded-md border border-line"
                  style={{ backgroundColor: site.light_color ?? undefined }}
                >
                  <span
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-white font-bold text-xs shrink-0"
                    style={{ backgroundColor: site.color ?? "#666" }}
                  >
                    {site.abbr ?? site.code}
                  </span>
                  <Link
                    href={`/planning/sites/${site.code}`}
                    className="font-bold text-sm hover:text-gold-dark truncate"
                  >
                    {site.name}
                  </Link>
                </div>
              ))}

              {/* Lignes : 1 par jour (sauf mobile = seulement le jour actif) */}
              {days.map((d, dayIdx) => {
                const dISO = toISODate(d);
                const isToday = dISO === toISODate(new Date());
                const showOnMobile = dayIdx === activeDay;
                return (
                  <div
                    key={`row-${dayIdx}`}
                    className={`contents ${showOnMobile ? "" : "max-md:hidden"}`}
                  >
                    <div
                      className={`flex flex-col justify-center px-2 py-2 rounded-md ${isToday ? "bg-gold-light/30" : "bg-surface-2/40"} max-md:col-span-full max-md:flex-row max-md:items-center max-md:gap-2`}
                    >
                      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                        {DAY_LABELS[dayIdx]}
                      </div>
                      <div className="font-bold text-sm">
                        {d.toLocaleDateString("fr-BE", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </div>
                    </div>
                    {sites.map((site) => {
                      const cellShifts = shiftsFor(site.id, dISO);
                      return (
                        <Card
                          key={`${dayIdx}-${site.id}`}
                          className="overflow-hidden"
                        >
                          <div className="p-2 space-y-1">
                            {cellShifts.length === 0 ? (
                              <div className="text-[11px] text-ink-3 italic text-center py-2">
                                —
                              </div>
                            ) : (
                              cellShifts.map((s) => (
                                <div
                                  key={s.id}
                                  className={`rounded px-1.5 py-1 text-xs ${
                                    s.is_overtime
                                      ? "border border-dashed border-orange-400"
                                      : ""
                                  }`}
                                  style={{
                                    backgroundColor: s.is_overtime
                                      ? "rgb(255 237 213 / 0.7)"
                                      : site.color
                                        ? `${site.color}18`
                                        : "rgb(245 235 200 / 0.5)",
                                    borderLeft: s.is_overtime
                                      ? "3px solid #f97316"
                                      : `3px solid ${site.color ?? "#c9a34d"}`,
                                  }}
                                  title={
                                    s.is_overtime
                                      ? `Heures sup.${s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}`
                                      : undefined
                                  }
                                >
                                  <div className="font-mono font-bold flex items-center gap-1">
                                    <span>
                                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                    </span>
                                    {s.is_overtime ? (
                                      <span className="ml-auto text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded bg-orange-100 text-orange-700">
                                        H. sup
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-[11px] mt-0.5">
                                    <EmployeeQuickLink
                                      employeeId={s.employee_id}
                                      fullName={s.employee?.full_name ?? "—"}
                                      fullWidth
                                    />
                                  </div>
                                  {s.position ? (
                                    <div className="text-[10px] text-ink-3 truncate">
                                      {s.position}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
