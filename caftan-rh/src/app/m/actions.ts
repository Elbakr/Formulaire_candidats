"use server";

// Karim 2026-06-02 : server actions pour /m dashboard mobile.
//  - getMobileDashboardDataAction : charge data des widgets actifs
//  - updateMobileDashboardPrefsAction : sauve les preferences user

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { UserPrefs, WidgetId } from "./widgets-catalog";

export async function updateMobileDashboardPrefsAction(prefs: UserPrefs): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();
  await admin.from("profiles").update({ mobile_dashboard_prefs: prefs }).eq("id", profile.id);
  revalidatePath("/m");
  return { ok: true };
}

/**
 * Karim 2026-06-02 : charge les data brutes des widgets actifs.
 * Chaque widget a sa propre query (peu nombreuses, optimisees mobile).
 */
export async function getMobileDashboardDataAction(opts: {
  enabledWidgets: WidgetId[];
  period?: "day" | "week" | "month";
  siteId?: string | null;
}): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();
  const out: Record<string, unknown> = {};

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  // Date range pour heures_periode
  const periodStart = new Date(today);
  if (opts.period === "week") periodStart.setDate(today.getDate() - 7);
  else if (opts.period === "month") periodStart.setDate(today.getDate() - 30);
  else periodStart.setDate(today.getDate()); // day
  const periodStartISO = periodStart.toISOString().slice(0, 10);

  if (opts.enabledWidgets.includes("pointage_live")) {
    // Karim 2026-06-02 : compte les shifts en cours aujourd'hui
    const { data: shifts } = await admin
      .from("shifts")
      .select("id, employee_id, site_id, started_at, ended_at, employee:employees(full_name), site:sites(name,code)")
      .gte("date", todayISO)
      .lte("date", todayISO);
    const total = (shifts ?? []).length;
    const present = (shifts ?? []).filter((s) => s.started_at && !s.ended_at).length;
    const done = (shifts ?? []).filter((s) => s.ended_at).length;
    const upcoming = total - present - done;
    out.pointage_live = { total, present, done, upcoming, shifts };
  }

  if (opts.enabledWidgets.includes("heures_periode")) {
    const { data: shifts } = await admin
      .from("shifts")
      .select("duration_hours, employee_id, site_id, date")
      .gte("date", periodStartISO)
      .lte("date", todayISO);
    const filtered = opts.siteId ? (shifts ?? []).filter((s) => s.site_id === opts.siteId) : (shifts ?? []);
    const totalHours = filtered.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0);
    out.heures_periode = { totalHours, count: filtered.length, period: opts.period ?? "day" };
  }

  if (opts.enabledWidgets.includes("planning_today")) {
    const { data: shifts } = await admin
      .from("shifts")
      .select("id, start_time, end_time, employee:employees(full_name), site:sites(name, code, color)")
      .eq("date", todayISO)
      .order("start_time", { ascending: true })
      .limit(20);
    out.planning_today = { shifts: shifts ?? [] };
  }

  if (opts.enabledWidgets.includes("alerts")) {
    const [{ count: pendingScreen }, { count: pendingValidations }, { count: pendingTerm }] = await Promise.all([
      admin.from("candidates").select("id", { count: "exact", head: true }).eq("status", "screening_pending"),
      admin.from("reinforcement_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("contract_terminations").select("id", { count: "exact", head: true }).eq("status", "pending_admin"),
    ]);
    out.alerts = {
      screening_pending: pendingScreen ?? 0,
      reinforcement_pending: pendingValidations ?? 0,
      terminations_pending: pendingTerm ?? 0,
    };
  }

  if (opts.enabledWidgets.includes("stats_salaires")) {
    const startMonth = todayISO.slice(0, 7) + "-01";
    const { data: payslips } = await admin
      .from("payslips")
      .select("amount_to_pay, payment_status")
      .gte("created_at", startMonth);
    const total = (payslips ?? []).reduce((s, p) => s + Number(p.amount_to_pay ?? 0), 0);
    const unpaid = (payslips ?? []).filter((p) => p.payment_status !== "paid");
    const unpaidTotal = unpaid.reduce((s, p) => s + Number(p.amount_to_pay ?? 0), 0);
    out.stats_salaires = { total, unpaidTotal, unpaidCount: unpaid.length, totalCount: (payslips ?? []).length };
  }

  if (opts.enabledWidgets.includes("mails_pending")) {
    const { count: total } = await admin
      .from("outbound_mails")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");
    out.mails_pending = { failed_count: total ?? 0 };
  }

  if (opts.enabledWidgets.includes("candidates_pending")) {
    const { count: newCount } = await admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    out.candidates_pending = { new_count: newCount ?? 0 };
  }

  if (opts.enabledWidgets.includes("terminations_pending")) {
    const { data: list } = await admin
      .from("contract_terminations")
      .select("id, requested_at, earliest_effective_date, employee:employees(full_name)")
      .eq("status", "pending_admin")
      .order("requested_at", { ascending: false })
      .limit(5);
    out.terminations_pending = { list: list ?? [] };
  }

  return { ok: true, data: out };
}

export async function listSitesForFilterAction(): Promise<{ ok: boolean; sites: Array<{ id: string; name: string; code: string }> }> {
  await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("sites")
    .select("id, name, code")
    .eq("is_active", true)
    .order("sort_order");
  return { ok: true, sites: (data ?? []) as Array<{ id: string; name: string; code: string }> };
}
