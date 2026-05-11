// GET /admin/overtime-audit/export?period=...&sites=...&contract=...
// CSV export du tableau audit. Mêmes filtres que la page UI.
// Sécurité : admin / rh / manager.

import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  startOfWeek,
  toISODate,
  shiftHours,
} from "@/lib/planning";

export const dynamic = "force-dynamic";

type PeriodKey = "this_week" | "next_week" | "last_4w" | "next_8w";

function periodBounds(period: PeriodKey): {
  weeks: string[];
  fromDate: string;
  toDate: string;
} {
  const today = new Date();
  const thisMonday = startOfWeek(today);
  let firstMonday: Date;
  let nbWeeks: number;
  switch (period) {
    case "this_week":
      firstMonday = thisMonday;
      nbWeeks = 1;
      break;
    case "next_week":
      firstMonday = addDays(thisMonday, 7);
      nbWeeks = 1;
      break;
    case "last_4w":
      firstMonday = addDays(thisMonday, -7 * 3);
      nbWeeks = 4;
      break;
    case "next_8w":
    default:
      firstMonday = thisMonday;
      nbWeeks = 8;
      break;
  }
  const weeks: string[] = [];
  for (let i = 0; i < nbWeeks; i++) {
    weeks.push(toISODate(addDays(firstMonday, i * 7)));
  }
  return {
    weeks,
    fromDate: weeks[0],
    toDate: toISODate(addDays(addDays(firstMonday, (nbWeeks - 1) * 7), 6)),
  };
}

function contractGroup(t: string | null | undefined): "cdi" | "cdd" | "student" | "other" {
  if (!t) return "other";
  const c = t.toLowerCase();
  if (c.includes("étudiant") || c.includes("etudiant") || c === "student") return "student";
  if (c === "cdd" || c.includes("cdd")) return "cdd";
  if (c === "cdi" || c.includes("cdi")) return "cdi";
  return "other";
}

function escapeCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = request.nextUrl.searchParams;
  const period = (sp.get("period") as PeriodKey) || "this_week";
  const contractFilter = sp.get("contract") ?? "all";
  const selectedSiteCodes = (sp.get("sites") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { weeks, fromDate, toDate } = periodBounds(period);
  const supabase = await createClient();

  const [{ data: empsRaw }, { data: assignsRaw }, { data: shiftsRaw }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, weekly_hours, contract_type, status")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("site_assignments")
        .select(
          `employee_id, is_primary,
           site:sites(id, code)`,
        )
        .lte("start_date", toDate)
        .or(`end_date.is.null,end_date.gte.${fromDate}`),
      supabase
        .from("shifts")
        .select(
          "id, employee_id, date, start_time, end_time, break_minutes, is_overtime",
        )
        .gte("date", fromDate)
        .lte("date", toDate),
    ]);

  const allEmployees = (empsRaw ?? []) as Array<{
    id: string;
    full_name: string;
    weekly_hours: number | null;
    contract_type: string | null;
    status: string;
  }>;
  const assigns = (assignsRaw ?? []) as unknown as Array<{
    employee_id: string;
    site: { id: string; code: string } | null;
  }>;
  const shifts = (shiftsRaw ?? []) as Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    is_overtime: boolean | null;
  }>;

  const sitesByEmp = new Map<string, Set<string>>();
  for (const a of assigns) {
    if (!a.site) continue;
    const set = sitesByEmp.get(a.employee_id) ?? new Set();
    set.add(a.site.code);
    sitesByEmp.set(a.employee_id, set);
  }

  const employees = allEmployees.filter((e) => {
    if (contractFilter !== "all" && contractGroup(e.contract_type) !== contractFilter) {
      return false;
    }
    if (selectedSiteCodes.length > 0) {
      const empSites = sitesByEmp.get(e.id);
      if (!empSites) return false;
      const hit = selectedSiteCodes.some((c) => empSites.has(c));
      if (!hit) return false;
    }
    return true;
  });

  type WeekCell = { contractual: number; overtime: number; hasOtTag: boolean };
  const cellsByEmp = new Map<string, Map<string, WeekCell>>();
  const weekSet = new Set(weeks);

  for (const s of shifts) {
    const monday = toISODate(startOfWeek(new Date(s.date + "T00:00:00")));
    if (!weekSet.has(monday)) continue;
    const h = shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
    let weekMap = cellsByEmp.get(s.employee_id);
    if (!weekMap) {
      weekMap = new Map();
      cellsByEmp.set(s.employee_id, weekMap);
    }
    let cell = weekMap.get(monday);
    if (!cell) {
      cell = { contractual: 0, overtime: 0, hasOtTag: false };
      weekMap.set(monday, cell);
    }
    if (s.is_overtime) {
      cell.overtime += h;
      cell.hasOtTag = true;
    } else {
      cell.contractual += h;
    }
  }

  const rows: string[] = [];
  const header = [
    "employe",
    "contrat",
    "cible_hebdo_h",
    "periode_h_contractuel",
    "periode_h_overtime",
    "periode_cible_h",
    "depassement_h",
    "semaines_en_depassement",
    "a_reclassifier",
  ];
  rows.push(header.map(escapeCsv).join(","));

  for (const e of employees) {
    const target = e.weekly_hours ?? 38;
    const wmap = cellsByEmp.get(e.id);
    let tContract = 0;
    let tOt = 0;
    let weekOver = 0;
    let needsReclassif = false;
    for (const wk of weeks) {
      const cell = wmap?.get(wk);
      if (!cell) continue;
      tContract += cell.contractual;
      tOt += cell.overtime;
      if (cell.contractual > target + 0.01) {
        weekOver += 1;
        if (!cell.hasOtTag) needsReclassif = true;
      }
    }
    const cumulativeTarget = target * weeks.length;
    const diff = tContract - cumulativeTarget;
    rows.push(
      [
        e.full_name,
        e.contract_type ?? "",
        e.weekly_hours ?? "",
        tContract.toFixed(2),
        tOt.toFixed(2),
        cumulativeTarget.toFixed(2),
        diff.toFixed(2),
        weekOver,
        needsReclassif ? "oui" : "non",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  const csv = rows.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="overtime-audit-${period}.csv"`,
    },
  });
}
