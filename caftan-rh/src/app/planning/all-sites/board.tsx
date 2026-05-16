"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Printer, Filter, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { addDays, parseISODate, toISODate, DAY_LABELS } from "@/lib/planning";
import { moveShiftAction } from "@/app/planning/actions";

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

export type SiteDayNeedRow = {
  site_id: string;
  day_of_week: number; // 0=Dim..6=Sam
  start_time: string;
  end_time: string;
  headcount: number;
  role: string | null;
  is_critical: number | null;
  is_enabled: boolean | null;
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
  needs = [],
  initialFilter,
}: {
  mondayISO: string;
  sites: AllSitesSite[];
  shifts: AllSitesShift[];
  needs?: SiteDayNeedRow[];
  initialFilter?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(initialFilter ?? "all");
  // Drag & drop (desktop) : id du shift en cours de drag + cellule survolee
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);
  // Tap-to-move (mobile + desktop) : tap sur un shift pour le selectionner,
  // puis tap sur une cellule destination pour le deplacer. Sur iPhone le drag
  // HTML5 ne marche pas, ce mode prend le relais.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shiftById = useMemo(() => {
    const m = new Map<string, AllSitesShift>();
    for (const s of shifts) m.set(s.id, s);
    return m;
  }, [shifts]);

  const selectedShift = selectedId ? shiftById.get(selectedId) ?? null : null;

  function moveTo(shiftId: string, toSiteId: string, toDate: string) {
    setDraggingId(null);
    setDropHover(null);
    setSelectedId(null);
    (async () => {
      const r = await moveShiftAction({ shiftId, toSiteId, toDate });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Shift déplacé.");
        router.refresh();
      }
    })();
  }

  function onShiftClick(shiftId: string) {
    setSelectedId((cur) => (cur === shiftId ? null : shiftId));
  }

  function onCellClick(siteId: string, dISO: string) {
    if (!selectedId) return;
    moveTo(selectedId, siteId, dISO);
  }

  const [activeDay, setActiveDay] = useState<number>(() => {
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

  // Couverture des site_needs par (site, day_of_week).
  // requiredByCell.get(`${siteId}|${dow}`) = { headcount: number, maxCritical: 0|1|2 }
  const requiredByCell = useMemo(() => {
    const m = new Map<string, { headcount: number; maxCritical: number }>();
    for (const n of needs) {
      if (n.is_enabled === false) continue;
      const key = `${n.site_id}|${n.day_of_week}`;
      const cur = m.get(key) ?? { headcount: 0, maxCritical: 0 };
      cur.headcount += n.headcount;
      if ((n.is_critical ?? 0) > cur.maxCritical) cur.maxCritical = n.is_critical ?? 0;
      m.set(key, cur);
    }
    return m;
  }, [needs]);

  function coverageFor(siteId: string, dISO: string, dayJsDow: number) {
    const req = requiredByCell.get(`${siteId}|${dayJsDow}`);
    const requiredHeadcount = req?.headcount ?? 0;
    const maxCritical = req?.maxCritical ?? 0;
    const actualHeadcount = shiftsFor(siteId, dISO).length;
    const missing = Math.max(0, requiredHeadcount - actualHeadcount);
    const surplus = Math.max(0, actualHeadcount - requiredHeadcount);
    let band: "covered" | "partial" | "empty" | "no-need" | "over" = "no-need";
    if (requiredHeadcount === 0) band = actualHeadcount > 0 ? "over" : "no-need";
    else if (actualHeadcount === 0) band = "empty";
    else if (actualHeadcount >= requiredHeadcount) band = surplus > 0 ? "over" : "covered";
    else band = "partial";
    return { requiredHeadcount, actualHeadcount, missing, surplus, band, maxCritical };
  }

  function doPrint() {
    window.print();
  }

  const siteById = useMemo(() => {
    const m = new Map<string, AllSitesSite>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  return (
    <div className="space-y-3 pb-24 md:pb-3">
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
        <span className="text-[11px] text-ink-3 hidden md:inline">
          Glisse-depose un shift OU tape pour selectionner puis tape la cellule cible.
        </span>
        <span className="text-[11px] text-ink-3 md:hidden">
          Tape un shift pour le selectionner, puis tape la cellule cible.
        </span>
      </div>

      {sites.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3 space-y-2">
            <div>Aucun planning généré pour cette semaine.</div>
            <div className="text-[12px]">
              Va sur{" "}
              <Link href="/planning/calendar" className="text-gold-dark font-bold hover:underline">
                Planning hebdo
              </Link>{" "}
              → « Générer la semaine », coche les sites concernés, puis reviens ici.
            </div>
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

          <div className="overflow-x-auto overscroll-x-contain -mx-2 px-2 pb-2">
            <div
              className="grid gap-2"
              style={{
                // Karim 16/05 : colonnes plus etroites pour voir 5-6 sites
                // sans scroll sur ecran 1280+. Avant : minmax(220px, 1fr)
                // -> 6 sites = 1440px min, colonnes hors ecran.
                gridTemplateColumns: `90px repeat(${sites.length}, minmax(140px, 1fr))`,
              }}
            >
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
                      const cellKey = `${site.id}|${dISO}`;
                      const isDropHover = dropHover === cellKey;
                      const isMoveTarget = !!selectedId;
                      const isSourceCell =
                        selectedShift?.site_id === site.id && selectedShift?.date === dISO;
                      const dayJsDow = d.getDay();
                      const cov = coverageFor(site.id, dISO, dayJsDow);
                      return (
                        <Card
                          key={`${dayIdx}-${site.id}`}
                          role={isMoveTarget && !isSourceCell ? "button" : undefined}
                          aria-label={
                            isMoveTarget && !isSourceCell
                              ? `Deplacer le shift selectionne ici (${site.name} ${dISO})`
                              : undefined
                          }
                          onClick={() => onCellClick(site.id, dISO)}
                          className={`overflow-hidden transition-colors ${
                            isDropHover ? "ring-2 ring-gold ring-inset bg-gold-light/40" : ""
                          } ${
                            isMoveTarget && !isSourceCell
                              ? "cursor-pointer hover:ring-2 hover:ring-gold/60 hover:bg-gold-light/20"
                              : ""
                          }`}
                          onDragOver={(ev) => {
                            if (!draggingId) return;
                            ev.preventDefault();
                            setDropHover(cellKey);
                          }}
                          onDragLeave={() => {
                            if (dropHover === cellKey) setDropHover(null);
                          }}
                          onDrop={(ev) => {
                            ev.preventDefault();
                            const id = ev.dataTransfer.getData("text/plain");
                            if (id) moveTo(id, site.id, dISO);
                          }}
                        >
                          {/* Badge couverture : besoins covered / partial / empty / over.
                              Karim 14/05 -- aider la direction a reperer les manques en un coup d oeil. */}
                          {cov.band !== "no-need" ? (
                            <div
                              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between gap-1 border-b ${
                                cov.band === "empty"
                                  ? "bg-danger-light text-danger border-danger/30"
                                  : cov.band === "partial"
                                    ? cov.maxCritical >= 2
                                      ? "bg-orange-100 text-orange-800 border-orange-300"
                                      : "bg-warn-light text-warn border-warn/30"
                                    : cov.band === "over"
                                      ? "bg-violet-100 text-violet-800 border-violet-300"
                                      : "bg-success-light text-success border-success/30"
                              }`}
                              title={
                                cov.band === "empty"
                                  ? `Aucun shift planifie sur ce site/jour, besoin ${cov.requiredHeadcount}`
                                  : cov.band === "partial"
                                    ? `Manque ${cov.missing} effectif${cov.missing > 1 ? "s" : ""}${cov.maxCritical >= 2 ? " (besoin ultra-critique)" : cov.maxCritical >= 1 ? " (besoin critique)" : ""}`
                                    : cov.band === "over"
                                      ? `Surplus de ${cov.surplus}`
                                      : `Couverture OK ${cov.actualHeadcount}/${cov.requiredHeadcount}`
                              }
                            >
                              <span>
                                {cov.actualHeadcount}/{cov.requiredHeadcount}
                              </span>
                              {cov.band === "empty" || cov.band === "partial" ? (
                                <span>−{cov.missing}</span>
                              ) : cov.band === "over" ? (
                                <span>+{cov.surplus}</span>
                              ) : (
                                <span>OK</span>
                              )}
                            </div>
                          ) : null}
                          <div className="p-2 space-y-1">
                            {cellShifts.length === 0 ? (
                              <div className="text-[11px] text-ink-3 italic text-center py-2">
                                {isMoveTarget && !isSourceCell ? "Tape ici pour deplacer" : "—"}
                              </div>
                            ) : (
                              cellShifts.map((s) => {
                                const isSelected = selectedId === s.id;
                                return (
                                  <div
                                    key={s.id}
                                    draggable
                                    onDragStart={(ev) => {
                                      ev.dataTransfer.setData("text/plain", s.id);
                                      ev.dataTransfer.effectAllowed = "move";
                                      setDraggingId(s.id);
                                    }}
                                    onDragEnd={() => {
                                      setDraggingId(null);
                                      setDropHover(null);
                                    }}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      onShiftClick(s.id);
                                    }}
                                    className={`rounded px-1.5 py-1 text-xs cursor-pointer select-none ${
                                      s.is_overtime
                                        ? "border border-dashed border-orange-400"
                                        : ""
                                    } ${draggingId === s.id ? "opacity-40" : ""} ${
                                      isSelected
                                        ? "ring-2 ring-gold ring-offset-1 ring-offset-white shadow-md scale-[1.02]"
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
                                        ? `Heures sup.${s.overtime_multiplier ? ` x${s.overtime_multiplier}` : ""}`
                                        : "Tape ou glisse-depose pour deplacer"
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
                                    <div className="text-[11px] mt-0.5" onClick={(e) => e.stopPropagation()}>
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
                                );
                              })
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

      {/* Bottom bar contextuel : visible quand un shift est selectionne.
          Sticky en bas d ecran. Affiche le shift selectionne + bouton annuler. */}
      {selectedShift ? (
        <div className="fixed inset-x-0 bottom-0 z-30 print:hidden">
          <div className="mx-auto max-w-3xl m-2 rounded-lg bg-ink text-white shadow-2xl border border-gold/40">
            <div className="flex items-center gap-3 p-3">
              <ArrowRight className="h-4 w-4 text-gold shrink-0" />
              <div className="flex-1 text-xs leading-tight">
                <div className="font-bold">
                  {selectedShift.employee?.full_name ?? "Shift"} —{" "}
                  {selectedShift.start_time.slice(0, 5)}-{selectedShift.end_time.slice(0, 5)}
                </div>
                <div className="text-white/70">
                  Actuellement : {siteById.get(selectedShift.site_id ?? "")?.name ?? "?"} • {selectedShift.date}
                </div>
                <div className="text-gold text-[11px] mt-0.5">
                  Tape une cellule cible pour deplacer.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Annuler la selection"
                className="rounded-md p-1.5 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
