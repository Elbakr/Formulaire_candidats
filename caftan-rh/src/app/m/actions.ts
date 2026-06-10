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

  // Karim 2026-06-10 (perf mobile A1) : AVANT, chaque widget activé était
  // chargé EN SÉRIE (1 await après l'autre) -> +3-6s avec 9 widgets. On lance
  // maintenant tous les widgets actifs EN PARALLÈLE (chacun écrit une clé
  // distincte de `out`, donc pas de course).
  const enabled = (w: WidgetId) => opts.enabledWidgets.includes(w);
  const tasks: Promise<void>[] = [];

  if (enabled("pointage_live")) tasks.push((async () => {
    // Vue clock_currently_in = pointes REELS maintenant (Tuya + manuels).
    let qIn = admin.from("clock_currently_in").select("employee_id, site_id, site_code, site_name, site_color, full_name, clock_in_at");
    if (opts.siteId) qIn = qIn.eq("site_id", opts.siteId);
    // Shifts attendus aujourd'hui (planning prevu)
    let qShifts = admin.from("shifts").select("id, employee_id, site_id, start_time, end_time, status").eq("date", todayISO);
    if (opts.siteId) qShifts = qShifts.eq("site_id", opts.siteId);
    // 'done' = sessions clos aujourd'hui
    let qSess = admin.from("clock_sessions").select("employee_id, clock_out_at").gte("clock_out_at", todayISO + "T00:00:00Z").lte("clock_out_at", todayISO + "T23:59:59Z");
    if (opts.siteId) qSess = qSess.eq("site_id", opts.siteId);
    // Les 3 sous-requêtes en parallèle (etaient en série avant).
    const [{ data: currentlyIn }, { data: shiftsToday }, { data: doneSessions }] = await Promise.all([qIn, qShifts, qSess]);
    const present = (currentlyIn ?? []).length;
    const total = (shiftsToday ?? []).length;
    const done = (doneSessions ?? []).length;
    const upcoming = Math.max(0, total - present - done);

    // Top sites avec presents pour breakdown
    const bySite = new Map<string, { code: string; name: string; color: string; count: number }>();
    for (const r of currentlyIn ?? []) {
      const k = r.site_id ?? "noSite";
      const prev = bySite.get(k) ?? { code: r.site_code ?? "?", name: r.site_name ?? "Sans site", color: r.site_color ?? "#888", count: 0 };
      prev.count++;
      bySite.set(k, prev);
    }
    out.pointage_live = {
      total, present, done, upcoming,
      bySite: Array.from(bySite.values()).sort((a, b) => b.count - a.count),
    };
  })());

  if (enabled("heures_periode")) tasks.push((async () => {
    // Karim 2026-06-10 : décompte via clock_sessions_billing (Tuya = source
    // de vérité ; pas de double comptage web sur jours Tuya).
    let q = admin.from("clock_sessions_billing")
      .select("duration_minutes, site_id")
      .gte("clock_in_at", periodStartISO + "T00:00:00Z")
      .lte("clock_in_at", todayISO + "T23:59:59Z")
      .not("clock_out_at", "is", null);
    if (opts.siteId) q = q.eq("site_id", opts.siteId);
    const { data: sessions } = await q;
    const totalMinutes = (sessions ?? []).reduce((s, x) => s + Number(x.duration_minutes ?? 0), 0);
    out.heures_periode = { totalHours: totalMinutes / 60, count: (sessions ?? []).length, period: opts.period ?? "day" };
  })());

  if (enabled("planning_today")) tasks.push((async () => {
    let q = admin
      .from("shifts")
      .select("id, start_time, end_time, employee:employees(full_name), site:sites(name, code, color)")
      .eq("date", todayISO)
      .order("start_time", { ascending: true })
      .limit(20);
    if (opts.siteId) q = q.eq("site_id", opts.siteId);
    const { data: shifts } = await q;
    out.planning_today = { shifts: shifts ?? [] };
  })());

  if (enabled("alerts")) tasks.push((async () => {
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
  })());

  if (enabled("stats_salaires")) tasks.push((async () => {
    const startMonth = todayISO.slice(0, 7) + "-01";
    const { data: payslips } = await admin
      .from("payslips")
      .select("amount_to_pay, payment_status")
      .gte("created_at", startMonth);
    const total = (payslips ?? []).reduce((s, p) => s + Number(p.amount_to_pay ?? 0), 0);
    const unpaid = (payslips ?? []).filter((p) => p.payment_status !== "paid");
    const unpaidTotal = unpaid.reduce((s, p) => s + Number(p.amount_to_pay ?? 0), 0);
    out.stats_salaires = { total, unpaidTotal, unpaidCount: unpaid.length, totalCount: (payslips ?? []).length };
  })());

  if (enabled("mails_pending")) tasks.push((async () => {
    const { count: total } = await admin
      .from("outbound_mails")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");
    out.mails_pending = { failed_count: total ?? 0 };
  })());

  if (enabled("candidates_pending")) tasks.push((async () => {
    const { count: newCount } = await admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    out.candidates_pending = { new_count: newCount ?? 0 };
  })());

  if (enabled("terminations_pending")) tasks.push((async () => {
    const { data: list } = await admin
      .from("contract_terminations")
      .select("id, requested_at, earliest_effective_date, employee:employees(full_name)")
      .eq("status", "pending_admin")
      .order("requested_at", { ascending: false })
      .limit(5);
    out.terminations_pending = { list: list ?? [] };
  })());

  await Promise.all(tasks);
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
