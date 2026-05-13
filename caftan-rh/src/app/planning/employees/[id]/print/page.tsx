import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  parseISODate,
  addDays,
  toISODate,
  DAY_LABELS,
  shiftHours,
} from "@/lib/planning";
import { PrintBar } from "./print-bar";

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  notes: string | null;
  is_overtime: boolean | null;
  overtime_multiplier: number | null;
  site: { code: string; name: string; color: string | null } | null;
};

type PrintAudience = "employee" | "admin";

export default async function EmployeePrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ weeks?: string; week?: string; audience?: string }>;
}) {
  // Cette page est réservée à admin/rh/manager (employé voit /me/planning).
  // Le query param `audience` permet de basculer entre :
  //   - 'employee' (défaut) : 1 page contractuels uniquement, à donner à l'employé
  //   - 'admin' : 2 pages — contractuels page 1, overtime page 2 (CSS break)
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const { id } = await props.params;
  const { weeks: wStr, week, audience: aStr } = await props.searchParams;
  const nbWeeks = Math.max(1, Math.min(13, parseInt(wStr || "1", 10) || 1));
  // Manager : forcé sur 'employee' pour éviter de divulguer les OT par erreur.
  const requestedAudience: PrintAudience =
    aStr === "admin" ? "admin" : "employee";
  const audience: PrintAudience =
    profile.role === "admin" || profile.role === "rh"
      ? requestedAudience
      : "employee";
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const rangeStart = toISODate(monday);
  const rangeEnd = toISODate(addDays(monday, nbWeeks * 7 - 1));

  const supabase = await createClient();
  const [{ data: emp }, { data: shiftsRaw }, { data: org }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, job_title, weekly_hours, contract_type, department:departments(name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select(
        `id, date, start_time, end_time, break_minutes, position, location, notes, is_overtime, overtime_multiplier,
         site:sites(code, name, color)`,
      )
      .eq("employee_id", id)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date")
      .order("start_time"),
    supabase.from("org_settings").select("org_name").eq("id", 1).single(),
  ]);
  if (!emp) notFound();

  const employee = emp as unknown as {
    id: string;
    full_name: string;
    job_title: string | null;
    weekly_hours: number | null;
    contract_type: string | null;
    department: { name: string } | null;
  };
  const allShifts = (shiftsRaw ?? []) as unknown as Shift[];
  // En audience='employee' : on FILTRE strictement les shifts overtime.
  // En audience='admin' : planning GLOBAL unique (decision Karim 2026-05-13) --
  // contractuel + OT dans le meme calendrier, sans mention textuelle "heures sup",
  // juste une differentiation visuelle (fond raye/colore).
  const contractualShifts = allShifts.filter((s) => !s.is_overtime);
  const shifts = audience === "employee" ? contractualShifts : allShifts;
  const orgName = (org as { org_name?: string } | null)?.org_name ?? "CaftanRH";

  const weeks = Array.from({ length: nbWeeks }, (_, i) => addDays(monday, i * 7));
  const totalHours = shifts.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
    0,
  );
  const target = (employee.weekly_hours ?? 38) * nbWeeks;

  return (
    <div className="bg-white text-black p-6 print:p-3">
      <PrintBar employeeId={employee.id} weeks={nbWeeks} weekISO={rangeStart} />

      <header className="text-center mb-3 print:mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">
          {orgName}
        </div>
        <h1 className="text-xl font-bold uppercase tracking-wider">
          Planning — {employee.full_name}
        </h1>
        <p className="text-xs text-gray-700">
          {employee.job_title ?? "—"}
          {employee.department?.name ? ` · ${employee.department.name}` : ""}
          {employee.contract_type ? ` · ${employee.contract_type}` : ""}
          {employee.weekly_hours ? ` · ${employee.weekly_hours}h/sem` : ""}
        </p>
        <p className="text-xs">
          du{" "}
          {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
          {addDays(monday, nbWeeks * 7 - 1).toLocaleDateString("fr-BE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}{" "}
          ({nbWeeks} semaine{nbWeeks > 1 ? "s" : ""})
        </p>
      </header>

      <div className="border border-gray-300 rounded p-2 text-[11px] mb-3 grid grid-cols-3 text-center">
        <div>
          <div className="uppercase tracking-wider text-gray-500 text-[9px]">Total planifié</div>
          <div className="font-mono font-bold text-base">{totalHours.toFixed(1)}h</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-gray-500 text-[9px]">Cible</div>
          <div className="font-mono text-base">{target.toFixed(0)}h</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-gray-500 text-[9px]">Écart</div>
          <div
            className={`font-mono font-bold text-base ${
              totalHours - target > 0
                ? "text-amber-700"
                : totalHours - target < 0
                  ? "text-gray-500"
                  : "text-green-700"
            }`}
          >
            {totalHours - target > 0 ? "+" : ""}
            {(totalHours - target).toFixed(1)}h
          </div>
        </div>
      </div>

      {weeks.map((wMonday, wi) => {
        const wDays = Array.from({ length: 7 }, (_, i) => addDays(wMonday, i));
        const isLast = wi === weeks.length - 1;
        const wHours = shifts
          .filter((s) => {
            const sd = parseISODate(s.date).getTime();
            return (
              sd >= wMonday.getTime() &&
              sd <= addDays(wMonday, 6).getTime()
            );
          })
          .reduce(
            (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
            0,
          );
        return (
          <section
            key={wi}
            className={`mb-4 ${isLast ? "" : "print:break-after-page"}`}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider mb-1 border-b border-gray-300 pb-0.5 flex items-center justify-between">
              <span>
                Semaine {wi + 1} —{" "}
                {wMonday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}{" "}
                au{" "}
                {addDays(wMonday, 6).toLocaleDateString("fr-BE", {
                  day: "2-digit",
                  month: "long",
                })}
              </span>
              <span className="font-mono">{wHours.toFixed(1)}h</span>
            </h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  {wDays.map((d, i) => (
                    <th
                      key={i}
                      className="border border-gray-400 px-1 py-1 text-center w-[14.28%]"
                    >
                      <div className="text-[9px] uppercase">{DAY_LABELS[i]}</div>
                      <div className="font-bold">
                        {d.getDate()}/{d.getMonth() + 1}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {wDays.map((d, i) => {
                    const dISO = toISODate(d);
                    const dShifts = shifts.filter((s) => s.date === dISO);
                    return (
                      <td
                        key={i}
                        className="border border-gray-400 align-top p-1 text-[10px]"
                      >
                        {dShifts.length === 0 ? (
                          <div className="text-center text-gray-300">—</div>
                        ) : (
                          dShifts.map((s) => {
                            // Differentiation visuelle OT vs contractuel SANS
                            // mention textuelle (decision Karim 2026-05-13).
                            // OT = fond legerement raye + bordure gauche grise.
                            const isOT = !!s.is_overtime;
                            const style: React.CSSProperties = isOT
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 2px, transparent 2px, transparent 6px)",
                                  borderLeft: "2px solid #9ca3af",
                                  paddingLeft: "3px",
                                }
                              : {};
                            return (
                              <div key={s.id} className="mb-1 rounded-sm px-0.5 py-0.5" style={style}>
                                <div className="font-bold">
                                  {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                                </div>
                                {s.site ? (
                                  <div className="text-[9px] font-bold">
                                    {s.site.code} · {s.site.name}
                                  </div>
                                ) : s.location ? (
                                  <div className="text-[9px] text-gray-600">
                                    {s.location}
                                  </div>
                                ) : null}
                                {s.position ? (
                                  <div className="text-[9px] text-gray-600">
                                    {s.position}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <footer className="mt-4 flex justify-between items-end text-[9px] text-gray-500">
        <div>
          Édité le{" "}
          {new Date().toLocaleDateString("fr-BE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
        <div className="text-right">
          <div>Signature employé&nbsp;:</div>
          <div className="border-b border-gray-400 w-48 mt-6" />
        </div>
      </footer>
    </div>
  );
}
