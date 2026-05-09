"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { startOfWeek, parseISODate, weekRange, addDays, toISODate, shiftHours, DAY_LABELS } from "@/lib/planning";

export type ScheduleBatch = {
  ok?: boolean;
  error?: string;
  payload?: Array<{
    employee_id: string;
    employee_email: string;
    employee_name: string;
    week_label: string;
    body_html: string;
    total_hours: number;
    shifts_count: number;
  }>;
};

/**
 * Prépare un email "votre planning de la semaine" pour chaque employé qui a au moins un shift.
 * Renvoyé au client qui envoie via EmailJS (cohérent avec le reste de la plateforme).
 */
export async function prepareWeekScheduleEmailsAction(weekISO: string): Promise<ScheduleBatch> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);
  const weekLabel = `du ${monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au ${addDays(monday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}`;

  const [{ data: emps }, { data: shifts }, { data: timeOff }, { data: org }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, email, weekly_hours")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes, position, location")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true }),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase.from("org_settings").select("org_name, org_email, org_phone").eq("id", 1).single(),
  ]);

  type Emp = { id: string; full_name: string; email: string; weekly_hours: number | null };
  type Shift = { employee_id: string; date: string; start_time: string; end_time: string; break_minutes: number; position: string | null; location: string | null };
  type Off = { employee_id: string; start_date: string; end_date: string };

  const employees = (emps ?? []) as unknown as Emp[];
  const allShifts = (shifts ?? []) as unknown as Shift[];
  const offs = (timeOff ?? []) as unknown as Off[];

  const orgName = (org as { org_name?: string } | null)?.org_name ?? "CaftanRH";
  const orgPhone = (org as { org_phone?: string } | null)?.org_phone ?? "";

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const payload: NonNullable<ScheduleBatch["payload"]> = [];

  for (const e of employees) {
    if (!e.email) continue;
    const empShifts = allShifts.filter((s) => s.employee_id === e.id);
    const hasOff = offs.some((t) => t.employee_id === e.id);
    if (empShifts.length === 0 && !hasOff) continue; // skip employés sans shift ni congé (probablement absents)

    const totalH = empShifts.reduce((acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);

    const rows = days.map((d, i) => {
      const iso = toISODate(d);
      const off = offs.find((t) => t.employee_id === e.id && iso >= t.start_date && iso <= t.end_date);
      const dayShifts = empShifts.filter((s) => s.date === iso);
      let cell = "";
      if (off) {
        cell = `<span style="color:#7c3aed;font-weight:bold">CONGÉ</span>`;
      } else if (dayShifts.length === 0) {
        cell = `<span style="color:#999">—</span>`;
      } else {
        cell = dayShifts.map((s) => {
          const where = s.location ? ` · ${s.location}` : "";
          const what = s.position ? ` (${s.position})` : "";
          return `<strong>${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}</strong>${what}${where}`;
        }).join("<br/>");
      }
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;width:120px">${DAY_LABELS[i]} ${d.getDate()}/${d.getMonth() + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${cell}</td>
      </tr>`;
    }).join("");

    const body_html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:600px">
<p>Bonjour ${e.full_name.split(/\s+/)[0]},</p>
<p>Voici ton planning <strong>${weekLabel}</strong> :</p>
<table style="border-collapse:collapse;width:100%;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
<thead>
  <tr style="background:#18181b;color:#c8a96e">
    <th style="padding:8px;text-align:left">Jour</th>
    <th style="padding:8px;text-align:left">Shift</th>
  </tr>
</thead>
<tbody>${rows}</tbody>
</table>
<p style="margin-top:12px"><strong>Total : ${totalH.toFixed(1)}h</strong> / cible ${e.weekly_hours ?? 38}h</p>
<p>Bonne semaine !<br/>L'équipe ${orgName}${orgPhone ? ` · ${orgPhone}` : ""}</p>
</div>`;

    payload.push({
      employee_id: e.id,
      employee_email: e.email,
      employee_name: e.full_name,
      week_label: weekLabel,
      body_html,
      total_hours: totalH,
      shifts_count: empShifts.length,
    });
  }

  return { ok: true, payload };
}

export async function logScheduleSentAction(
  employeeId: string,
  subject: string,
  body: string,
) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  // Trouver l'application linkée si elle existe (pour insérer dans messages)
  const { data: emp } = await supabase
    .from("employees")
    .select("application_id, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  const e = emp as unknown as { application_id: string | null; full_name: string } | null;

  if (e?.application_id) {
    await supabase.from("messages").insert({
      application_id: e.application_id,
      direction: "outbound",
      sender_id: profile.id,
      subject,
      body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
      email_provider_id: "emailjs.schedule",
    });
  }
  return { ok: true };
}
