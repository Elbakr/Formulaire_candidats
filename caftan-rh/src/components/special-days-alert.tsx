import { CalendarHeart, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

const FR_DAY_FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FR_MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/**
 * Encart "Jours spéciaux à venir" pour l'employé.
 * - Liste les holidays kind!=legal dans les N prochains jours.
 * - Met en surbrillance ceux qui tombent sur un jour OFF habituel de l'employé
 *   (fixed_off_days) : sur ces dates, l'OFF est IGNORÉ par le solver
 *   (force-assignation), l'employé est présumé disponible.
 *
 * Décision Karim 2026-05-11.
 */
export async function SpecialDaysAlert({
  employeeId,
  fixedOffDays,
  horizonDays = 60,
}: {
  employeeId: string;
  fixedOffDays: number[] | null | undefined;
  horizonDays?: number;
}) {
  const supabase = await createClient();
  const today = new Date();
  const endDate = new Date(today.getTime() + horizonDays * 86_400_000);
  const todayISO = today.toISOString().slice(0, 10);
  const endISO = endDate.toISOString().slice(0, 10);

  const { data: rawHolidays } = await supabase
    .from("holidays")
    .select("date, label, kind, priority, tradition")
    .eq("is_active", true)
    .neq("kind", "legal")
    .gte("date", todayISO)
    .lte("date", endISO)
    .order("date", { ascending: true });

  // Vérifie aussi si l'employé a déjà un congé approuvé sur ces dates
  // (auquel cas pas de force-assignation, on respecte le vrai congé).
  const { data: leaves } = await supabase
    .from("time_off_requests")
    .select("start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", endISO)
    .gte("end_date", todayISO);

  const holidays = (rawHolidays ?? []) as Array<{
    date: string;
    label: string;
    kind: string | null;
    priority: number | null;
    tradition: string | null;
  }>;
  const approvedLeaves = (leaves ?? []) as Array<{ start_date: string; end_date: string }>;

  if (holidays.length === 0) return null;

  // Convention fixed_off_days : 0=Lun..6=Dim ; Date.getDay() : 0=Dim..6=Sam.
  const off = new Set((fixedOffDays ?? []) as number[]);
  function isFixedOff(d: Date): boolean {
    const jsDow = d.getDay();
    const isoDow = jsDow === 0 ? 6 : jsDow - 1;
    return off.has(isoDow);
  }
  function hasLeave(dateISO: string): boolean {
    return approvedLeaves.some(
      (l) => dateISO >= l.start_date && dateISO <= l.end_date,
    );
  }

  // On garde un focus visuel sur les jours où le force-on a un impact réel
  // (= l'employé est OFF habituellement). Les autres jours, on affiche en
  // version plus discrète juste pour info.
  const impactful = holidays.filter((h) => {
    const d = new Date(h.date + "T00:00:00");
    return isFixedOff(d) && !hasLeave(h.date);
  });
  const others = holidays.filter((h) => !impactful.includes(h)).slice(0, 6);

  return (
    <Card className={impactful.length > 0 ? "border-warn" : "border-line"}>
      <div className={`p-3 border-b border-line flex items-center gap-2 ${impactful.length > 0 ? "bg-warn-light/40" : ""}`}>
        {impactful.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
        ) : (
          <CalendarHeart className="h-4 w-4 text-gold-dark shrink-0" />
        )}
        <h2 className="font-bold text-sm">
          {impactful.length > 0 ? (
            <>Tu es présumé·e disponible sur {impactful.length} jour{impactful.length > 1 ? "s" : ""} spécial{impactful.length > 1 ? "s" : ""}</>
          ) : (
            <>Jours spéciaux à venir</>
          )}
        </h2>
      </div>
      {impactful.length > 0 ? (
        <ul className="divide-y divide-line">
          {impactful.map((h) => {
            const d = new Date(h.date + "T00:00:00");
            return (
              <li key={h.date} className="p-3 flex items-center gap-3">
                <div className="text-center min-w-[40px]">
                  <div className="text-[10px] uppercase text-ink-3">{FR_DAY_FULL[d.getDay()].slice(0, 3)}</div>
                  <div className="font-bold text-lg leading-none">{d.getDate()}</div>
                  <div className="text-[10px] text-ink-3">{FR_MONTH_SHORT[d.getMonth()]}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{h.label}</div>
                  <div className="text-[11px] text-warn font-bold">
                    Ton OFF habituel ({FR_DAY_FULL[d.getDay()]}) est ignoré ce jour-là.
                  </div>
                  {h.tradition ? (
                    <div className="text-[10px] text-ink-3 italic mt-0.5 truncate">{h.tradition}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {others.length > 0 ? (
        <div className="p-2 text-[11px] text-ink-3">
          Autres jours spéciaux à venir :{" "}
          {others.map((h, i) => (
            <span key={h.date}>
              {i > 0 ? " · " : ""}
              <span className="font-bold">{h.date.slice(8, 10)}/{h.date.slice(5, 7)}</span> {h.label}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
