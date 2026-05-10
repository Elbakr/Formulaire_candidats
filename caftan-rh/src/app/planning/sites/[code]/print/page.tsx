import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
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
import { loadSiteByCode, loadSiteNeeds } from "@/lib/sites";
import { SitePrintBar } from "./print-bar";

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  employee: { full_name: string } | null;
};

export default async function SitePrintPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ week?: string; weeks?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { code } = await props.params;
  const { week, weeks: wStr } = await props.searchParams;

  const site = await loadSiteByCode(code.toUpperCase());
  if (!site) notFound();

  const nbWeeks = Math.max(1, Math.min(8, parseInt(wStr || "1", 10) || 1));
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const rangeStart = toISODate(monday);
  const rangeEnd = toISODate(addDays(monday, nbWeeks * 7 - 1));

  const supabase = await createClient();
  const [needs, { data: shiftsRaw }] = await Promise.all([
    loadSiteNeeds(site.id),
    supabase
      .from("shifts")
      .select(
        `id, date, start_time, end_time, break_minutes, position,
         employee:employees(full_name)`,
      )
      .eq("site_id", site.id)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date")
      .order("start_time"),
  ]);
  const shifts = (shiftsRaw ?? []) as unknown as Shift[];

  const weeks = Array.from({ length: nbWeeks }, (_, i) => addDays(monday, i * 7));

  return (
    <div className="bg-white text-black p-6 print:p-3">
      <div className="flex items-center justify-between mb-3 print:hidden">
        <Link
          href={`/planning/sites/${site.code}`}
          className="text-xs text-gold-dark font-bold inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
        <SitePrintBar siteCode={site.code} weeks={nbWeeks} weekISO={rangeStart} />
      </div>

      <header className="text-center mb-3">
        <h1 className="text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded text-white font-bold"
            style={{ backgroundColor: site.color ?? "#666" }}
          >
            {site.abbr ?? site.code}
          </span>
          {site.name}
        </h1>
        {site.address ? (
          <p className="text-xs text-gray-600">{site.address}</p>
        ) : null}
        <p className="text-xs">
          Du{" "}
          {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
          {addDays(monday, nbWeeks * 7 - 1).toLocaleDateString("fr-BE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      {weeks.map((wMonday, wi) => {
        const wDays = Array.from({ length: 7 }, (_, i) => addDays(wMonday, i));
        const isLast = wi === weeks.length - 1;

        // Liste unique des employés ayant un shift cette semaine sur le site.
        const wShifts = shifts.filter((s) => {
          const sd = parseISODate(s.date).getTime();
          return sd >= wMonday.getTime() && sd <= addDays(wMonday, 6).getTime();
        });
        const empNames = Array.from(
          new Set(wShifts.map((s) => s.employee?.full_name).filter(Boolean) as string[]),
        ).sort();

        return (
          <section
            key={wi}
            className={`mb-4 ${isLast ? "" : "print:break-after-page"}`}
          >
            {nbWeeks > 1 ? (
              <h2 className="text-xs font-bold uppercase tracking-wider mb-1 border-b border-gray-300 pb-0.5">
                Semaine {wi + 1} —{" "}
                {wMonday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
              </h2>
            ) : null}
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-2 py-1 text-left">
                    Employé
                  </th>
                  {wDays.map((d, i) => (
                    <th
                      key={i}
                      className="border border-gray-400 px-1 py-1 text-center"
                    >
                      <div className="text-[9px] uppercase">{DAY_LABELS[i]}</div>
                      <div className="font-bold">
                        {d.getDate()}/{d.getMonth() + 1}
                      </div>
                    </th>
                  ))}
                  <th className="border border-gray-400 px-2 py-1 text-center">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {empNames.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="border border-gray-400 px-2 py-3 text-center text-gray-500 italic"
                    >
                      Aucun shift planifié cette semaine sur ce site.
                    </td>
                  </tr>
                ) : (
                  empNames.map((name) => {
                    const empShifts = wShifts.filter(
                      (s) => s.employee?.full_name === name,
                    );
                    const total = empShifts.reduce(
                      (acc, s) =>
                        acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
                      0,
                    );
                    return (
                      <tr key={name} className="break-inside-avoid">
                        <td className="border border-gray-400 px-2 py-1 font-bold">
                          {name}
                        </td>
                        {wDays.map((d, i) => {
                          const dISO = toISODate(d);
                          const ds = empShifts.filter((s) => s.date === dISO);
                          return (
                            <td
                              key={i}
                              className="border border-gray-400 px-1 py-1 align-top text-[10px]"
                            >
                              {ds.length === 0 ? (
                                <div className="text-center text-gray-300">—</div>
                              ) : (
                                ds.map((s) => (
                                  <div key={s.id} className="mb-0.5 font-mono">
                                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                  </div>
                                ))
                              )}
                            </td>
                          );
                        })}
                        <td className="border border-gray-400 px-2 py-1 text-center font-mono font-bold">
                          {total.toFixed(1)}h
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {wi === 0 && needs.length > 0 ? (
              <div className="mt-2 text-[10px] text-gray-600 border border-gray-300 rounded p-2">
                <div className="font-bold uppercase tracking-wider mb-0.5">
                  Effectif requis hebdomadaire (par jour)
                </div>
                <ul className="grid grid-cols-7 gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const dayNeeds = needs.filter((n) => n.day_of_week === dow);
                    return (
                      <li key={dow}>
                        <span className="font-bold">
                          {DAY_LABELS[dow === 0 ? 6 : dow - 1]}
                        </span>
                        {dayNeeds.length === 0 ? (
                          <div className="text-gray-400">fermé</div>
                        ) : (
                          dayNeeds.map((n, i) => (
                            <div key={i}>
                              {n.start_time.slice(0, 5)}–{n.end_time.slice(0, 5)} ·{" "}
                              {n.headcount}p
                            </div>
                          ))
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}

      <footer className="mt-4 text-[9px] text-gray-500 text-center">
        Édité le{" "}
        {new Date().toLocaleDateString("fr-BE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}{" "}
        — {site.name} (CaftanRH)
      </footer>
    </div>
  );
}
