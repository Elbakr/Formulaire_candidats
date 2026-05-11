"use server";

/**
 * Reclassification douce des heures supplémentaires.
 *
 * Contexte : la table `shifts` distingue les heures contractuelles
 * (`is_overtime = false`) et les heures supplémentaires (`is_overtime = true`).
 * Historiquement, certains shifts ont été créés en dépassement du
 * `weekly_hours` contractuel sans être taggés OT. Cette action passe au peigne
 * fin chaque employé/semaine et marque les shifts excédentaires en
 * `is_overtime = true, overtime_multiplier = 1.5` jusqu'à ce que la somme des
 * heures contractuelles redescende sous `weekly_hours`.
 *
 * Stratégie : on choisit les shifts les PLUS RÉCENTS (créés en dernier) à
 * reclassifier — rationale : ce sont eux qui ont fait "déborder" le seau.
 *
 * Idempotence : si une semaine n'a aucun dépassement contractuel OU si elle a
 * déjà au moins un shift `is_overtime = true`, on ne touche à rien.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import {
  startOfWeek,
  addDays,
  toISODate,
  parseISODate,
  shiftHours,
} from "@/lib/planning";

export type ReclassifyResult = {
  ok?: boolean;
  error?: string;
  dry_run: boolean;
  affected_employees: number;
  shifts_reclassified: number;
  hours_moved: number;
  by_employee: Array<{
    employee_id: string;
    full_name: string;
    weeks: Array<{
      week_monday: string;
      shifts_count: number;
      hours_moved: number;
    }>;
  }>;
};

export type ReclassifyParams = {
  employeeIds?: string[] | null;
  fromDate?: string | null;
  toDate?: string | null;
  dryRun?: boolean;
};

type EmpRow = {
  id: string;
  full_name: string;
  weekly_hours: number | null;
  contract_type: string | null;
  status: string;
};

type ShiftRow = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  is_overtime: boolean | null;
  created_at: string;
};

function weekMondayFor(dateISO: string): string {
  const d = parseISODate(dateISO);
  return toISODate(startOfWeek(d));
}

export async function reclassifyOvertimeAction(
  params: ReclassifyParams,
): Promise<ReclassifyResult> {
  const empty: ReclassifyResult = {
    dry_run: !!(params.dryRun ?? true),
    affected_employees: 0,
    shifts_reclassified: 0,
    hours_moved: 0,
    by_employee: [],
  };

  try {
    const { profile } = await requireRole(["admin", "rh"]);
    const supabase = await createClient();

    const dryRun = params.dryRun ?? true;
    const today = new Date();
    const fromDate =
      params.fromDate ?? toISODate(addDays(startOfWeek(today), -7 * 8));
    const toDate =
      params.toDate ?? toISODate(addDays(startOfWeek(today), 7 * 8));

    // 1) Employés concernés (filtrage optionnel).
    let empQuery = supabase
      .from("employees")
      .select("id, full_name, weekly_hours, contract_type, status")
      .eq("status", "active");
    if (params.employeeIds && params.employeeIds.length > 0) {
      empQuery = empQuery.in("id", params.employeeIds);
    }
    const { data: empsRaw, error: empErr } = await empQuery;
    if (empErr) return { ...empty, error: empErr.message };
    const emps = (empsRaw ?? []) as EmpRow[];
    if (emps.length === 0) return { ...empty, ok: true };

    // 2) Shifts dans la période, pour tous ces employés.
    const empIds = emps.map((e) => e.id);
    const { data: shiftsRaw, error: shErr } = await supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, break_minutes, is_overtime, created_at",
      )
      .in("employee_id", empIds)
      .gte("date", fromDate)
      .lte("date", toDate);
    if (shErr) return { ...empty, error: shErr.message };
    const shifts = (shiftsRaw ?? []) as ShiftRow[];

    // 3) Agrégation par employé puis par semaine.
    const byEmp = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const arr = byEmp.get(s.employee_id) ?? [];
      arr.push(s);
      byEmp.set(s.employee_id, arr);
    }

    const toUpdateIds: string[] = [];
    const byEmployee: ReclassifyResult["by_employee"] = [];
    let totalShiftsReclassified = 0;
    let totalHoursMoved = 0;
    let affectedEmployees = 0;

    for (const emp of emps) {
      const weeklyTarget = emp.weekly_hours ?? 38;
      const empShifts = byEmp.get(emp.id) ?? [];
      if (empShifts.length === 0) continue;

      // Groupe par lundi de semaine.
      const byWeek = new Map<string, ShiftRow[]>();
      for (const s of empShifts) {
        const wk = weekMondayFor(s.date);
        const arr = byWeek.get(wk) ?? [];
        arr.push(s);
        byWeek.set(wk, arr);
      }

      const weeksAffected: Array<{
        week_monday: string;
        shifts_count: number;
        hours_moved: number;
      }> = [];

      for (const [weekMonday, weekShifts] of byWeek) {
        const contractual = weekShifts.filter((s) => !s.is_overtime);
        const overtime = weekShifts.filter((s) => s.is_overtime);
        const sumContractual = contractual.reduce(
          (acc, s) =>
            acc +
            shiftHours(
              s.start_time.slice(0, 5),
              s.end_time.slice(0, 5),
              s.break_minutes ?? 0,
            ),
          0,
        );

        // Idempotence : si déjà OT taggé OU pas de dépassement, on saute.
        if (overtime.length > 0) continue;
        if (sumContractual <= weeklyTarget + 0.01) continue;

        // Sélection : on trie les contractuels par created_at DESC et on tague
        // les plus récents jusqu'à passer sous weekly_hours.
        const sorted = [...contractual].sort((a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
        );
        let remaining = sumContractual;
        let shiftsThisWeek = 0;
        let hoursThisWeek = 0;
        for (const s of sorted) {
          if (remaining <= weeklyTarget + 0.01) break;
          const h = shiftHours(
            s.start_time.slice(0, 5),
            s.end_time.slice(0, 5),
            s.break_minutes ?? 0,
          );
          toUpdateIds.push(s.id);
          remaining -= h;
          shiftsThisWeek += 1;
          hoursThisWeek += h;
        }

        if (shiftsThisWeek > 0) {
          weeksAffected.push({
            week_monday: weekMonday,
            shifts_count: shiftsThisWeek,
            hours_moved: +hoursThisWeek.toFixed(2),
          });
          totalShiftsReclassified += shiftsThisWeek;
          totalHoursMoved += hoursThisWeek;
        }
      }

      if (weeksAffected.length > 0) {
        affectedEmployees += 1;
        byEmployee.push({
          employee_id: emp.id,
          full_name: emp.full_name,
          weeks: weeksAffected,
        });
      }
    }

    // 4) Application réelle si demandé.
    if (!dryRun && toUpdateIds.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const note = `Reclassifié auto ${today}`;
      const { error: updErr } = await supabase
        .from("shifts")
        .update({
          is_overtime: true,
          overtime_multiplier: 1.5,
          notes: note,
        })
        .in("id", toUpdateIds);
      if (updErr) return { ...empty, error: updErr.message };

      // Log activité par employé impacté.
      for (const e of byEmployee) {
        await logActivity({
          kind: "shift.updated",
          targetType: "employee",
          targetId: e.employee_id,
          description: `Reclassification douce OT — ${e.weeks.length} sem., ${e.weeks.reduce((acc, w) => acc + w.shifts_count, 0)} shifts`,
          data: {
            reason: "overtime_reclassification_soft",
            weeks: e.weeks,
          },
          actorId: profile.id,
          actorLabel: profile.full_name ?? profile.email ?? null,
        });
      }

      revalidatePath("/admin/overtime-audit");
      revalidatePath("/planning", "layout");
    }

    return {
      ok: true,
      dry_run: dryRun,
      affected_employees: affectedEmployees,
      shifts_reclassified: totalShiftsReclassified,
      hours_moved: +totalHoursMoved.toFixed(2),
      by_employee: byEmployee,
    };
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
}
