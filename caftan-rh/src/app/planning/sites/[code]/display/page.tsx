// Karim 20/05 : vue 'affichable' du planning par site, optimisée
// pour lisibilité maximale (impression A4, écran magasin, partage).
// Layout : 1 colonne par jour, 1 carte par shift (gros texte, fond
// coloré par employé, créneau bien visible).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { PrintButton } from "./print-button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  startOfWeek,
  parseISODate,
  toISODate,
  addDays,
  weekRange,
  shiftHours,
} from "@/lib/planning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Palette de couleurs distinctes pour les employes (hash sur full_name)
const EMP_COLORS = [
  { bg: "#fef3c7", fg: "#78350f", ring: "#f59e0b" },
  { bg: "#dbeafe", fg: "#1e3a8a", ring: "#3b82f6" },
  { bg: "#dcfce7", fg: "#14532d", ring: "#22c55e" },
  { bg: "#fce7f3", fg: "#831843", ring: "#ec4899" },
  { bg: "#e0e7ff", fg: "#312e81", ring: "#6366f1" },
  { bg: "#fed7aa", fg: "#7c2d12", ring: "#ea580c" },
  { bg: "#cffafe", fg: "#164e63", ring: "#06b6d4" },
  { bg: "#f3e8ff", fg: "#581c87", ring: "#a855f7" },
  { bg: "#fef9c3", fg: "#713f12", ring: "#eab308" },
  { bg: "#d1fae5", fg: "#064e3b", ring: "#10b981" },
];
function colorForName(name: string): typeof EMP_COLORS[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return EMP_COLORS[hash % EMP_COLORS.length];
}

export default async function SiteDisplayPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { code } = await props.params;
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const supabase = await createClient();
  const { data: siteRaw } = await supabase
    .from("sites")
    .select("id, code, name, color, light_color, address, city")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!siteRaw) return notFound();
  const site = siteRaw as { id: string; code: string; name: string; color: string | null; light_color: string | null; address: string | null; city: string | null };

  const [{ data: shiftsRaw }, { data: needsRaw }] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        `id, employee_id, date, start_time, end_time, break_minutes, position, is_overtime, overtime_multiplier,
         employee:employees(id, full_name, job_title)`,
      )
      .eq("site_id", site.id)
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
    supabase
      .from("site_needs")
      .select("day_of_week, start_time, end_time, headcount, role, is_critical")
      .eq("site_id", site.id)
      .eq("is_enabled", true),
  ]);

  type ShiftRow = {
    id: string; employee_id: string; date: string;
    start_time: string; end_time: string; break_minutes: number;
    position: string | null; is_overtime: boolean | null; overtime_multiplier: number | null;
    employee: { id: string; full_name: string; job_title: string | null } | null;
  };
  const shifts = (shiftsRaw ?? []) as unknown as ShiftRow[];
  const needs = (needsRaw ?? []) as Array<{
    day_of_week: number; start_time: string; end_time: string;
    headcount: number; role: string | null; is_critical: number;
  }>;

  // Group shifts par date
  const shiftsByDate = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const arr = shiftsByDate.get(s.date) ?? [];
    arr.push(s);
    shiftsByDate.set(s.date, arr);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const dayDate = addDays(monday, i);
    const dateISO = toISODate(dayDate);
    const jsDow = dayDate.getDay();
    const dayShifts = (shiftsByDate.get(dateISO) ?? []).sort(
      (a, b) => a.start_time.localeCompare(b.start_time),
    );
    const dayNeeds = needs.filter((n) => n.day_of_week === jsDow);
    const requiredHc = dayNeeds.reduce((acc, n) => acc + n.headcount, 0);
    return { dateISO, dayDate, dayShifts, requiredHc, dayNeeds };
  });

  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const todayISO = toISODate(new Date());

  const totalShifts = shifts.length;
  const totalHours = shifts.reduce(
    (acc, s) => acc + shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Toolbar : masquée en impression */}
      <div className="print:hidden sticky top-0 z-10 border-b border-line bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/planning/sites/${site.code}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour fiche site
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`?week=${prevWeek}`}><ChevronLeft className="h-3.5 w-3.5" /></Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`?week=${todayISO}`}>Cette semaine</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`?week=${nextWeek}`}><ChevronRight className="h-3.5 w-3.5" /></Link>
        </Button>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      {/* Header affichable */}
      <div className="px-4 py-3 sm:px-8 sm:py-6 border-b-4 border-double border-gold bg-surface">
        <div className="flex items-start gap-3 sm:gap-5">
          <span
            className="inline-flex items-center justify-center h-14 w-14 sm:h-20 sm:w-20 rounded-lg text-white font-bold text-xl sm:text-3xl shrink-0"
            style={{ backgroundColor: site.color ?? "#666" }}
          >
            {site.code}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight">{site.name}</h1>
            {site.address ? (
              <p className="text-sm sm:text-base text-ink-2 mt-1 inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {site.address}{site.city ? `, ${site.city}` : ""}
              </p>
            ) : null}
            <div className="mt-2 text-sm sm:text-base font-bold text-ink-2">
              Semaine du {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
              {" "}au {addDays(monday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
            <div className="mt-2 flex gap-4 text-xs sm:text-sm">
              <span className="font-bold">
                {totalShifts} shift{totalShifts > 1 ? "s" : ""}
              </span>
              <span className="text-ink-2">·</span>
              <span className="font-bold">{totalHours.toFixed(1)}h totales</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grille jours */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-0 print:grid-cols-7">
        {days.map(({ dateISO, dayDate, dayShifts, requiredHc, dayNeeds }, idx) => {
          const isToday = dateISO === todayISO;
          const isWeekend = idx >= 5;
          return (
            <div
              key={dateISO}
              className={`border-r border-b border-line min-h-[180px] flex flex-col ${
                isWeekend ? "bg-surface-2/40" : "bg-surface"
              } ${isToday ? "ring-2 ring-gold ring-inset" : ""}`}
            >
              {/* Header jour */}
              <div
                className={`px-2 py-2 border-b border-line ${
                  isToday ? "bg-gold-light" : isWeekend ? "bg-surface-2" : "bg-surface-2/50"
                }`}
              >
                <div className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-ink-3">
                  {DAY_LABELS[idx]}
                </div>
                <div className="text-lg sm:text-2xl font-bold leading-tight">
                  {dayDate.getDate()}{" "}
                  <span className="text-[10px] sm:text-xs font-normal text-ink-3">
                    {dayDate.toLocaleDateString("fr-BE", { month: "short" })}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] sm:text-[11px]">
                  <span className="font-bold">{dayShifts.length}</span>
                  <span className="text-ink-3">/</span>
                  <span className={requiredHc > dayShifts.length ? "text-danger font-bold" : "text-ink-3"}>
                    {requiredHc}
                  </span>
                  <span className="text-ink-3">attendu{requiredHc > 1 ? "s" : ""}</span>
                  {requiredHc > dayShifts.length ? (
                    <span className="ml-auto text-danger font-bold">
                      −{requiredHc - dayShifts.length}
                    </span>
                  ) : dayShifts.length > requiredHc ? (
                    <span className="ml-auto text-success font-bold">
                      +{dayShifts.length - requiredHc}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Shifts du jour */}
              <div className="flex-1 p-1.5 space-y-1.5">
                {dayShifts.length === 0 ? (
                  <div className="text-[11px] text-ink-3 italic text-center py-3">
                    Aucun shift
                  </div>
                ) : (
                  dayShifts.map((s) => {
                    const empName = s.employee?.full_name ?? "—";
                    const c = colorForName(empName);
                    const h = shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0);
                    return (
                      <div
                        key={s.id}
                        className="rounded p-1.5 sm:p-2 border-l-4 text-[11px] sm:text-xs leading-tight"
                        style={{ backgroundColor: c.bg, color: c.fg, borderLeftColor: c.ring }}
                      >
                        <div className="font-bold text-[12px] sm:text-sm truncate">
                          {empName}
                        </div>
                        <div className="font-mono font-bold mt-0.5">
                          {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span>{h.toFixed(1)}h</span>
                          {s.break_minutes > 0 ? (
                            <span className="opacity-70">· pause {s.break_minutes}'</span>
                          ) : null}
                          {s.is_overtime ? (
                            <span className="ml-auto px-1 rounded bg-orange-500 text-white text-[9px] font-bold">
                              OT×{s.overtime_multiplier ?? 1.5}
                            </span>
                          ) : null}
                        </div>
                        {s.position ? (
                          <div className="text-[10px] opacity-80 mt-0.5 truncate">{s.position}</div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Besoins du jour (visible en impression aussi) */}
              {dayNeeds.length > 0 ? (
                <div className="px-1.5 py-1 border-t border-line bg-surface-2/30 text-[9px] sm:text-[10px] text-ink-3 print:text-[8px]">
                  <div className="font-bold uppercase tracking-wider mb-0.5">Besoins</div>
                  {dayNeeds.map((n, i) => (
                    <div key={i} className="truncate">
                      {n.start_time.slice(0, 5)}-{n.end_time.slice(0, 5)} ×{n.headcount}
                      {n.role ? ` · ${n.role}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 sm:px-8 text-[10px] sm:text-xs text-ink-3 border-t border-line">
        Caftan Factory · {site.name} · Généré le {new Date().toLocaleDateString("fr-BE", { dateStyle: "long" })} à {new Date().toLocaleTimeString("fr-BE", { timeStyle: "short" })}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { font-size: 10pt; }
        }
      `}</style>
    </div>
  );
}

