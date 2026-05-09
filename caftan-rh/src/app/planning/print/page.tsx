import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startOfWeek, addDays, toISODate, parseISODate, weekRange, DAY_LABELS, shiftHours } from "@/lib/planning";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  weekly_hours: number | null;
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

type TimeOff = { employee_id: string; start_date: string; end_date: string };

export default async function PrintPlanningPage(
  props: { searchParams: Promise<{ week?: string }> },
) {
  await requireRole(["admin", "rh", "manager"]);
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const supabase = await createClient();
  const [{ data: emps }, { data: shifts }, { data: timeOff }, { data: org }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title, weekly_hours, department:departments(name)")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, position, location")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase.from("org_settings").select("org_name").eq("id", 1).single(),
  ]);

  const employees = (emps ?? []) as unknown as Employee[];
  const allShifts = (shifts ?? []) as unknown as Shift[];
  const offs = (timeOff ?? []) as unknown as TimeOff[];
  const orgName = (org as { org_name?: string } | null)?.org_name ?? "CaftanRH";

  function shiftsFor(empId: string, dateISO: string) {
    return allShifts.filter((s) => s.employee_id === empId && s.date === dateISO);
  }

  function isOff(empId: string, dateISO: string) {
    return offs.some((t) => t.employee_id === empId && dateISO >= t.start_date && dateISO <= t.end_date);
  }

  function totalHours(empId: string) {
    return allShifts
      .filter((s) => s.employee_id === empId)
      .reduce((acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  }

  return (
    <div className="bg-white text-black p-6 print:p-0">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link href={`/planning/calendar?week=${toISODate(monday)}`} className="text-sm text-gold-dark font-bold inline-flex items-center gap-2 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour au planning éditable
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-gold text-[#1a1a0d] font-bold rounded-md px-4 py-2 inline-flex items-center gap-2"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>

      <header className="text-center mb-4">
        <h1 className="text-3xl font-bold uppercase tracking-wider">{orgName}</h1>
        <p className="text-lg">
          Planning de la semaine du{" "}
          {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
          {addDays(monday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </header>

      {employees.length === 0 ? (
        <p className="text-center text-gray-500">Aucun employé actif.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-1 text-left">Employé</th>
              {days.map((d, i) => (
                <th key={i} className="border border-gray-400 px-2 py-1 text-center">
                  <div className="text-[10px] uppercase">{DAY_LABELS[i]}</div>
                  <div className="font-bold">{d.getDate()}/{d.getMonth() + 1}</div>
                </th>
              ))}
              <th className="border border-gray-400 px-2 py-1 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const total = totalHours(e.id);
              return (
                <tr key={e.id} className="break-inside-avoid">
                  <td className="border border-gray-400 px-2 py-1 align-top">
                    <div className="font-bold">{e.full_name}</div>
                    <div className="text-[10px] text-gray-600">{e.job_title} · {e.department?.name ?? ""}</div>
                  </td>
                  {days.map((d, i) => {
                    const dateISO = toISODate(d);
                    const off = isOff(e.id, dateISO);
                    const dayShifts = shiftsFor(e.id, dateISO);
                    return (
                      <td key={i} className={`border border-gray-400 px-2 py-1 align-top text-xs ${off ? "bg-purple-50" : ""}`}>
                        {off ? (
                          <div className="text-center text-purple-700 font-bold">CONGÉ</div>
                        ) : dayShifts.length === 0 ? (
                          <div className="text-center text-gray-300">—</div>
                        ) : (
                          dayShifts.map((s) => (
                            <div key={s.id} className="mb-1">
                              <div className="font-bold">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</div>
                              {s.position ? <div className="text-[10px]">{s.position}</div> : null}
                              {s.location ? <div className="text-[10px] text-gray-600">{s.location}</div> : null}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                  <td className="border border-gray-400 px-2 py-1 text-center align-top">
                    <div className="font-bold font-mono">{total.toFixed(1)}h</div>
                    <div className="text-[10px] text-gray-600">/ {e.weekly_hours ?? 38}h</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <footer className="mt-6 text-[10px] text-center text-gray-500 print:fixed print:bottom-2 print:left-0 print:right-0">
        Édité depuis CaftanRH · {new Date().toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </footer>
    </div>
  );
}
