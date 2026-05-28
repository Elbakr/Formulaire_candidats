// Karim 2026-05-28 : page d encodage bulk des shifts non pointes depuis
// le 1er mai. Filtres par site/periode/employe + selection multiple +
// action bulk qui insere IN+OUT aux heures planifiees (ou modifiees).

import Link from "next/link";
import { ArrowLeft, ClipboardEdit } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { readCity, siteCodesForCity } from "@/lib/city";
import { BulkEncodeForm } from "./bulk-encode-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { from?: string; to?: string; site?: string };

export default async function EncodeShiftsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "rh"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const city = await readCity();
  const cityCodes = siteCodesForCity(city);

  // Periode par defaut : 1er mai -> aujourd hui
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = sp.from ?? "2026-05-01";
  const toDate = sp.to ?? today;
  const filterSite = sp.site ?? "all";

  // Sites
  const { data: sitesRaw } = await supabase
    .from("sites")
    .select("id, code, name, color")
    .eq("is_active", true)
    .order("sort_order");
  type Site = { id: string; code: string; name: string; color: string | null };
  const sitesAll = (sitesRaw ?? []) as Site[];
  const sitesScope = sitesAll.filter((s) => cityCodes.includes(s.code));
  const siteByCode = new Map(sitesAll.map((s) => [s.code, s]));
  const siteById = new Map(sitesAll.map((s) => [s.id, s]));

  // Filtre des sites selon param
  const sitesToShow = filterSite === "all"
    ? sitesScope
    : sitesScope.filter((s) => s.code === filterSite);

  // Shifts dans la periode (sur les sites filtres)
  const siteIdsToShow = sitesToShow.map((s) => s.id);
  const { data: shiftsRaw } = await supabase
    .from("shifts")
    .select("id, employee_id, site_id, date, start_time, end_time, break_minutes")
    .gte("date", fromDate)
    .lte("date", toDate)
    .in("site_id", siteIdsToShow)
    .order("date", { ascending: true });
  type Shift = { id: string; employee_id: string; site_id: string; date: string; start_time: string; end_time: string; break_minutes: number | null };
  const shifts = (shiftsRaw ?? []) as Shift[];

  // Employés
  const empIds = [...new Set(shifts.map((s) => s.employee_id))];
  const { data: empsRaw } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };
  type Emp = { id: string; full_name: string };
  const emps = (empsRaw ?? []) as Emp[];
  const empById = new Map(emps.map((e) => [e.id, e]));

  // Clock entries pour les memes employes + periode (pour detecter shifts non pointes)
  const { data: entriesRaw } = empIds.length
    ? await supabase
        .from("clock_entries")
        .select("employee_id, kind, occurred_at, shift_id")
        .in("employee_id", empIds)
        .gte("occurred_at", `${fromDate}T00:00:00Z`)
        .lte("occurred_at", `${toDate}T23:59:59Z`)
    : { data: [] };
  type Entry = { employee_id: string; kind: "in" | "out"; occurred_at: string; shift_id: string | null };
  const entries = (entriesRaw ?? []) as Entry[];

  // Map (employee_id, date) -> true si pointe (au moins 1 IN ce jour)
  const pointedKey = new Set<string>();
  for (const e of entries) {
    if (e.kind === "in") {
      const day = e.occurred_at.slice(0, 10);
      pointedKey.add(`${e.employee_id}|${day}`);
    }
  }

  // Shifts non pointes
  const unpointed = shifts
    .filter((s) => {
      const day = s.date.slice(0, 10);
      return !pointedKey.has(`${s.employee_id}|${day}`);
    })
    .map((s) => ({
      shiftId: s.id,
      employeeId: s.employee_id,
      employeeName: empById.get(s.employee_id)?.full_name ?? "?",
      siteId: s.site_id,
      siteCode: siteById.get(s.site_id)?.code ?? "?",
      date: s.date.slice(0, 10),
      startTime: s.start_time.slice(0, 5),
      endTime: s.end_time.slice(0, 5),
    }))
    .sort((a, b) => (a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardEdit className="h-5 w-5 text-gold-dark" />
            Encoder les shifts non pointés
          </h1>
          <p className="text-sm text-ink-2">
            Liste des shifts planifiés depuis le {fromDate} sans pointage. Sélectionne et encode en bulk avec les heures planifiées (ou modifie cas par cas).
          </p>
        </div>
        <Link href="/admin/presence" className="text-xs px-3 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Présence
        </Link>
      </div>

      <Card>
        <form className="px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase font-bold text-ink-3">Du</span>
          <input type="date" name="from" defaultValue={fromDate} className="px-2 py-1 rounded border border-line bg-surface" />
          <span className="text-[10px] uppercase font-bold text-ink-3">au</span>
          <input type="date" name="to" defaultValue={toDate} className="px-2 py-1 rounded border border-line bg-surface" />
          <span className="text-[10px] uppercase font-bold text-ink-3 ml-2">Site</span>
          <select name="site" defaultValue={filterSite} className="px-2 py-1 rounded border border-line bg-surface">
            <option value="all">Tous ({sitesScope.map((s) => s.code).join("/")})</option>
            {sitesScope.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
          <button type="submit" className="px-3 py-1 rounded bg-gold text-[#1a1a0d] font-bold">Filtrer</button>
          <span className="ml-auto text-[11px] text-ink-3">
            <span className="font-bold text-amber-700">{unpointed.length}</span> shift(s) non pointé(s)
          </span>
        </form>
      </Card>

      {unpointed.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun shift non pointé sur cette période. 🎉
          </div>
        </Card>
      ) : (
        <BulkEncodeForm
          unpointed={unpointed}
          sitesForGroup={sitesToShow.map((s) => ({ code: s.code, name: s.name, color: s.color }))}
        />
      )}
    </div>
  );
}
