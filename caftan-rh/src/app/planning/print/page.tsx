import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  addDays,
  toISODate,
  parseISODate,
  DAY_LABELS,
  shiftHours,
} from "@/lib/planning";
import { PrintToolbar } from "./print-toolbar";

type Period = "week" | "3weeks" | "month";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  weekly_hours: number | null;
  department_id: string | null;
  department: { name: string } | null;
};

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
};

type TimeOff = {
  employee_id: string;
  start_date: string;
  end_date: string;
};

type Holiday = {
  date: string;
  label: string;
  kind:
    | "legal"
    | "school_break"
    | "company_closure"
    | "event_other"
    | "religious"
    | "international";
  priority: number | null;
  tradition: string | null;
};
type Closure = {
  label: string;
  start_date: string;
  end_date: string;
  department_id: string | null;
};

function periodWeeks(p: Period): number {
  if (p === "3weeks") return 3;
  if (p === "month") return 4;
  return 1;
}

function parsePeriod(s: string | undefined): Period {
  if (s === "3weeks" || s === "month") return s;
  return "week";
}

export default async function PrintPlanningPage(props: {
  searchParams: Promise<{ week?: string; period?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { week, period: pStr } = await props.searchParams;
  const period = parsePeriod(pStr);
  const nbWeeks = periodWeeks(period);

  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const rangeStart = toISODate(monday);
  const rangeEnd = toISODate(addDays(monday, nbWeeks * 7 - 1));

  const supabase = await createClient();
  const [
    { data: emps },
    { data: shifts },
    { data: timeOff },
    { data: org },
    { data: hols },
    { data: cls },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, job_title, weekly_hours, department_id, department:departments(name)",
      )
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, break_minutes, position, location",
      )
      .gte("date", rangeStart)
      .lte("date", rangeEnd),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart),
    supabase.from("org_settings").select("org_name").eq("id", 1).single(),
    supabase
      .from("holidays")
      .select("date, label, kind, priority, tradition")
      .eq("is_active", true)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("priority", { ascending: false }),
    supabase
      .from("company_closures")
      .select("label, start_date, end_date, department_id")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart),
  ]);

  const employees = (emps ?? []) as unknown as Employee[];
  const allShifts = (shifts ?? []) as unknown as Shift[];
  const offs = (timeOff ?? []) as unknown as TimeOff[];
  const holidays = (hols ?? []) as Holiday[];
  const closures = (cls ?? []) as Closure[];
  const orgName = (org as { org_name?: string } | null)?.org_name ?? "CaftanRH";

  // On garde le top-1 par jour (le plus prioritaire) pour la teinte de fond
  // mais on liste tous les fériés du jour dans le bandeau.
  const holidaysByDate = new Map<string, Holiday[]>();
  for (const h of holidays) {
    const arr = holidaysByDate.get(h.date) ?? [];
    arr.push(h);
    holidaysByDate.set(h.date, arr);
  }
  for (const arr of holidaysByDate.values()) {
    arr.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  function holidayBgFor(h: Holiday): string {
    if (h.kind === "legal") return "bg-red-50";
    if (h.kind === "religious") {
      if (h.tradition === "islamic") return "bg-emerald-50";
      if (h.tradition === "jewish") return "bg-indigo-50";
      if (h.tradition === "hindu") return "bg-orange-50";
      return "bg-cyan-50";
    }
    if (h.kind === "international") return "bg-sky-50";
    return "";
  }
  function holidayTextFor(h: Holiday): string {
    if (h.kind === "legal") return "text-red-700";
    if (h.kind === "religious") {
      if (h.tradition === "islamic") return "text-emerald-800";
      if (h.tradition === "jewish") return "text-indigo-800";
      if (h.tradition === "hindu") return "text-orange-800";
      return "text-cyan-800";
    }
    if (h.kind === "international") return "text-sky-800";
    return "text-gray-700";
  }
  function holidayDotFor(h: Holiday): string {
    if (h.kind === "legal") return "bg-red-500";
    if (h.kind === "religious") {
      if (h.tradition === "islamic") return "bg-emerald-500";
      if (h.tradition === "jewish") return "bg-indigo-500";
      if (h.tradition === "hindu") return "bg-orange-500";
      return "bg-cyan-500";
    }
    if (h.kind === "international") return "bg-sky-500";
    return "bg-gray-400";
  }

  function shiftsFor(empId: string, dateISO: string) {
    return allShifts.filter((s) => s.employee_id === empId && s.date === dateISO);
  }
  function isOff(empId: string, dateISO: string) {
    return offs.some(
      (t) => t.employee_id === empId && dateISO >= t.start_date && dateISO <= t.end_date,
    );
  }
  function closureFor(dateISO: string, deptId: string | null): Closure | null {
    return (
      closures.find(
        (c) =>
          dateISO >= c.start_date &&
          dateISO <= c.end_date &&
          (c.department_id === null || c.department_id === deptId),
      ) ?? null
    );
  }
  function totalHoursForWeek(empId: string, weekMonday: Date) {
    const ws = toISODate(weekMonday);
    const we = toISODate(addDays(weekMonday, 6));
    return allShifts
      .filter((s) => s.employee_id === empId && s.date >= ws && s.date <= we)
      .reduce((acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  }
  function totalHoursForRange(empId: string) {
    return allShifts
      .filter(
        (s) => s.employee_id === empId && s.date >= rangeStart && s.date <= rangeEnd,
      )
      .reduce((acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  }

  const weeks = Array.from({ length: nbWeeks }, (_, i) => addDays(monday, i * 7));

  const periodLabel =
    period === "week"
      ? "de la semaine"
      : period === "3weeks"
        ? "sur 3 semaines"
        : "mensuel (4 semaines)";

  return (
    <div className="bg-white text-black p-6 print:p-3">
      <PrintToolbar mondayISO={toISODate(monday)} period={period} />

      <header className="text-center mb-4 print:mb-2">
        <h1 className="text-2xl font-bold uppercase tracking-wider">{orgName}</h1>
        <p className="text-base">
          Planning {periodLabel} — du{" "}
          {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
          {addDays(monday, nbWeeks * 7 - 1).toLocaleDateString("fr-BE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      {holidays.length > 0 ? (
        <section className="mb-4 print:mb-2 border border-gray-300 rounded p-2 text-[11px]">
          <div className="font-bold uppercase tracking-wider mb-1">
            Faits notables sur la période
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {holidays
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-1.5 ${holidayTextFor(h)}`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${holidayDotFor(h)}`}
                  />
                  <span className="font-mono text-[10px] text-gray-600">
                    {parseISODate(h.date).toLocaleDateString("fr-BE", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <span className="font-bold">{h.label}</span>
                  {(h.priority ?? 0) >= 3 ? (
                    <span className="ml-auto inline-block px-1 py-px rounded bg-current text-white text-[8px] uppercase opacity-80">
                      Critique
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {employees.length === 0 ? (
        <p className="text-center text-gray-500">Aucun employé actif.</p>
      ) : (
        <>
          {weeks.map((wMonday, wi) => {
            const wDays = Array.from({ length: 7 }, (_, i) => addDays(wMonday, i));
            const isLast = wi === weeks.length - 1;
            return (
              <section
                key={wi}
                className={`mb-6 ${isLast ? "" : "print:break-after-page"}`}
              >
                {nbWeeks > 1 ? (
                  <h2 className="text-sm font-bold uppercase tracking-wider mb-1 mt-2 border-b border-gray-300 pb-0.5">
                    Semaine {wi + 1} — du{" "}
                    {wMonday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}{" "}
                    au{" "}
                    {addDays(wMonday, 6).toLocaleDateString("fr-BE", {
                      day: "2-digit",
                      month: "long",
                    })}
                  </h2>
                ) : null}
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-2 py-1 text-left">
                        Employé
                      </th>
                      {wDays.map((d, i) => {
                        const dISO = toISODate(d);
                        const dayHols = holidaysByDate.get(dISO) ?? [];
                        const top = dayHols[0];
                        return (
                          <th
                            key={i}
                            className={`border border-gray-400 px-1 py-1 text-center ${
                              top ? holidayBgFor(top) : ""
                            }`}
                          >
                            <div className="text-[9px] uppercase">{DAY_LABELS[i]}</div>
                            <div className="font-bold">
                              {d.getDate()}/{d.getMonth() + 1}
                            </div>
                            {dayHols.map((h, hi) => (
                              <div
                                key={hi}
                                className={`text-[8px] font-bold truncate ${holidayTextFor(h)}`}
                                title={h.label}
                              >
                                {h.label}
                              </div>
                            ))}
                          </th>
                        );
                      })}
                      <th className="border border-gray-400 px-2 py-1 text-center">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => {
                      const total = totalHoursForWeek(e.id, wMonday);
                      return (
                        <tr key={e.id} className="break-inside-avoid">
                          <td className="border border-gray-400 px-2 py-1 align-top">
                            <div className="font-bold">{e.full_name}</div>
                            <div className="text-[9px] text-gray-600">
                              {e.job_title} · {e.department?.name ?? ""}
                            </div>
                          </td>
                          {wDays.map((d, i) => {
                            const dateISO = toISODate(d);
                            const off = isOff(e.id, dateISO);
                            const dayShifts = shiftsFor(e.id, dateISO);
                            const top = (holidaysByDate.get(dateISO) ?? [])[0];
                            const cl = closureFor(dateISO, e.department_id);
                            const cellBg = off
                              ? "bg-purple-50"
                              : top
                                ? holidayBgFor(top)
                                : cl
                                  ? "bg-amber-50"
                                  : "";
                            return (
                              <td
                                key={i}
                                className={`border border-gray-400 px-1 py-1 align-top text-[10px] ${cellBg}`}
                              >
                                {off ? (
                                  <div className="text-center text-purple-700 font-bold">
                                    CONGÉ
                                  </div>
                                ) : cl && dayShifts.length === 0 ? (
                                  <div className="text-center text-amber-800 font-bold text-[9px]">
                                    FERMÉ
                                  </div>
                                ) : dayShifts.length === 0 ? (
                                  <div className="text-center text-gray-300">—</div>
                                ) : (
                                  dayShifts.map((s) => (
                                    <div key={s.id} className="mb-0.5">
                                      <div className="font-bold">
                                        {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                                      </div>
                                      {s.position ? (
                                        <div className="text-[9px]">{s.position}</div>
                                      ) : null}
                                      {s.location ? (
                                        <div className="text-[9px] text-gray-600">
                                          {s.location}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))
                                )}
                              </td>
                            );
                          })}
                          <td className="border border-gray-400 px-2 py-1 text-center align-top">
                            <div className="font-bold font-mono">{total.toFixed(1)}h</div>
                            <div className="text-[9px] text-gray-600">
                              / {e.weekly_hours ?? 38}h
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

          {nbWeeks > 1 ? (
            <section className="mt-6 break-inside-avoid">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-1 border-b border-gray-300 pb-0.5">
                Récap période ({nbWeeks} semaines)
              </h2>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 px-2 py-1 text-left">Employé</th>
                    <th className="border border-gray-400 px-2 py-1 text-center">
                      Heures totales
                    </th>
                    <th className="border border-gray-400 px-2 py-1 text-center">
                      Cible ({nbWeeks} × hebdo)
                    </th>
                    <th className="border border-gray-400 px-2 py-1 text-center">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const total = totalHoursForRange(e.id);
                    const target = (e.weekly_hours ?? 38) * nbWeeks;
                    const diff = total - target;
                    return (
                      <tr key={e.id}>
                        <td className="border border-gray-400 px-2 py-1">
                          <div className="font-bold">{e.full_name}</div>
                          <div className="text-[9px] text-gray-600">
                            {e.job_title} · {e.department?.name ?? ""}
                          </div>
                        </td>
                        <td className="border border-gray-400 px-2 py-1 text-center font-mono font-bold">
                          {total.toFixed(1)}h
                        </td>
                        <td className="border border-gray-400 px-2 py-1 text-center font-mono">
                          {target.toFixed(0)}h
                        </td>
                        <td
                          className={`border border-gray-400 px-2 py-1 text-center font-mono font-bold ${
                            diff > 0
                              ? "text-amber-700"
                              : diff < 0
                                ? "text-gray-500"
                                : "text-green-700"
                          }`}
                        >
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(1)}h
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}

      <footer className="mt-6 text-[9px] text-center text-gray-500 print:fixed print:bottom-2 print:left-0 print:right-0">
        Édité depuis CaftanRH ·{" "}
        {new Date().toLocaleDateString("fr-BE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </footer>
    </div>
  );
}
