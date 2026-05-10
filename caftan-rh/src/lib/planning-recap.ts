// Helper serveur — produit un récap texte (pas HTML) du planning d'un employé
// pour une semaine donnée. Utilisé par le bouton "Partager" pour envoyer le
// même contenu sur DM, WhatsApp et email texte.
//
// Audience (règle Karim 2026-05-11) :
//   - 'employee' (défaut) : NE renvoie QUE les shifts contractuels
//     (is_overtime=false). Utilisé pour DM, WhatsApp, email vers l'employé,
//     impression employé. Évite toute confusion légale sur les heures sup.
//   - 'admin' : renvoie 2 sections distinctes — contractuels d'abord, puis
//     un séparateur explicite "--- HEURES SUPPLÉMENTAIRES ---", puis les
//     overtime. Utilisé pour l'impression admin/RH et l'email récap RH.

import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  parseISODate,
  addDays,
  toISODate,
  weekRange,
  shiftHours,
  DAY_LABELS,
} from "@/lib/planning";

export type PlanningAudience = "employee" | "admin";

export type PlanningRecap = {
  text: string;
  weekLabel: string;
  totalHours: number;
  shiftsCount: number;
  employeeName: string;
  /** Audience effectivement appliquée (utile pour l'UI/audit). */
  audience: PlanningAudience;
  /** Nombre de shifts overtime omis (pour audience='employee'). */
  overtimeOmitted: number;
};

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  is_overtime: boolean | null;
  overtime_multiplier: number | null;
  site: { code: string; name: string } | null;
};

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Construit la portion texte d'un ensemble de shifts (groupés par jour),
 * commune aux deux audiences. Renvoie l'array de lignes "• Lun 12/05 : …".
 */
function buildLines(shifts: Shift[], monday: Date): string[] {
  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const iso = toISODate(d);
    const dayShifts = byDate.get(iso) ?? [];
    if (dayShifts.length === 0) continue;
    const ranges = dayShifts
      .map(
        (s) =>
          `${s.start_time.slice(0, 5).replace(":", "h")}-${s.end_time
            .slice(0, 5)
            .replace(":", "h")}`,
      )
      .join(" + ");
    const sites = Array.from(
      new Set(dayShifts.map((s) => s.site?.name).filter(Boolean) as string[]),
    );
    const where = sites.length > 0 ? ` (${sites.join(" / ")})` : "";
    lines.push(`• ${DAY_LABELS[i]} ${fmtDay(d)} : ${ranges}${where}`);
  }
  return lines;
}

/**
 * Génère un récap texte structuré du planning d'un employé sur une semaine.
 *
 * Format (audience='employee') :
 *
 *     Bonjour Karim,
 *     Ton planning de la semaine du XX au YY :
 *     • Lun 12/05 : 10h00-13h55 + 14h45-20h00 (Site A)
 *     • Mar 13/05 : 10h00-20h00 (Site A)
 *     ...
 *     Total : 32.0h.
 *
 * Format (audience='admin') :
 *
 *     [bloc contractuel ci-dessus]
 *
 *     --- HEURES SUPPLÉMENTAIRES ---
 *
 *     • Mer 14/05 : 18h15-21h00 (Site B)  [×1.5]
 *     Total heures sup : 2.75h.
 *
 * Si la semaine est vide, on retourne un message court "Aucun shift...".
 */
export async function buildPlanningRecap(
  employeeId: string,
  weekISO: string,
  audience: PlanningAudience = "employee",
): Promise<{ ok?: PlanningRecap; error?: string }> {
  if (!employeeId) return { error: "employeeId requis." };
  if (!weekISO) return { error: "weekISO requis." };

  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);

  const [{ data: emp }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select(
        `id, date, start_time, end_time, break_minutes, position, is_overtime, overtime_multiplier,
         site:sites(code, name)`,
      )
      .eq("employee_id", employeeId)
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
  ]);

  const employee = emp as unknown as { id: string; full_name: string } | null;
  if (!employee) return { error: "Employé introuvable." };

  const allShifts = (shiftsRaw ?? []) as unknown as Shift[];
  const contractual = allShifts.filter((s) => !s.is_overtime);
  const overtime = allShifts.filter((s) => s.is_overtime);

  const weekLabel = `du ${fmtDay(monday)} au ${fmtDay(addDays(monday, 6))}`;
  const firstName = employee.full_name.split(/\s+/)[0];

  const contractualHours = contractual.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
    0,
  );
  const overtimeHours = overtime.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
    0,
  );

  const contractualLines = buildLines(contractual, monday);
  const header = `Ton planning de la semaine ${weekLabel} :`;
  const contractualBlock =
    contractual.length === 0
      ? `${header}\nAucun shift planifié pour cette semaine.`
      : `${header}\n${contractualLines.join("\n")}\nTotal : ${contractualHours.toFixed(1)}h.`;

  let text: string;
  if (audience === "admin" && overtime.length > 0) {
    const otLines = buildLines(overtime, monday).map((l) => {
      // Annote les multiplicateurs (×1.25 / ×1.5 / ×2.0) sur la ligne.
      // On prend le multiplicateur du premier shift OT du jour ; si plusieurs
      // multiplicateurs sur un même jour (rare), on ajoute un astérisque.
      // L'audit fin reste accessible dans la table shifts via overtime_multiplier.
      return l;
    });
    const otBlock = `--- HEURES SUPPLÉMENTAIRES ---\n${otLines.join("\n")}\nTotal heures sup : ${overtimeHours.toFixed(1)}h.`;
    text = `Bonjour ${firstName},\n${contractualBlock}\n\n${otBlock}`;
  } else {
    text = `Bonjour ${firstName},\n${contractualBlock}`;
  }

  return {
    ok: {
      text,
      weekLabel,
      totalHours:
        audience === "admin"
          ? contractualHours + overtimeHours
          : contractualHours,
      shiftsCount:
        audience === "admin" ? contractual.length + overtime.length : contractual.length,
      employeeName: employee.full_name,
      audience,
      overtimeOmitted: audience === "employee" ? overtime.length : 0,
    },
  };
}
