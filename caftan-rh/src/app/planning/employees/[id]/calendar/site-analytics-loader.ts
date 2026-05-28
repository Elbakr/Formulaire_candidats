// Karim 2026-05-22 : mutualisation des queries pour SiteStatsPanel +
// SiteIncoherenceBanner. Auparavant chacun chargeait ses propres queries
// (5+3 = 8 queries Supabase pour 2 composants qui partagent les memes
// donnees). Maintenant 1 seule fonction charge tout en parallele et les
// composants recoivent les data en props.

import { createClient } from "@/lib/supabase/server";

export type SiteAnalyticsData = {
  site: {
    id: string;
    code: string;
    name: string;
    color: string | null;
    light_color: string | null;
  } | null;
  members: Array<{
    id: string;
    full_name: string;
    weekly_hours: number | null;
    status: string;
  }>;
  memberIds: Set<string>;
  shiftsOnSite: Array<{
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
    overtime_multiplier: number | null;
    full_name: string | null;
  }>;
  shiftsElsewhereForMembers: Array<{
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    site_id: string | null;
    site_code: string | null;
  }>;
  needs: Array<{
    day_of_week: number;
    headcount: number;
    start_time: string;
    end_time: string;
    is_critical: number;
    is_enabled: boolean;
  }>;
  leaves: Array<{
    employee_id: string;
    start_date: string;
    end_date: string;
    kind: string;
  }>;
};

/**
 * Charge toutes les donnees analytics d un site pour une semaine donnee.
 * Une seule fonction, queries en parallele. Resultat passe en props a
 * SiteStatsPanel + SiteIncoherenceBanner.
 */
export async function loadSiteAnalyticsData(
  siteId: string,
  weekStart: string,
  weekEnd: string,
): Promise<SiteAnalyticsData> {
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  // Phase 1 : queries en parallele (4 queries, indépendantes les unes des autres)
  const [
    { data: siteRow },
    { data: assignsRaw },
    { data: shiftsOnSiteRaw },
    { data: needsRaw },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, color, light_color")
      .eq("id", siteId)
      .maybeSingle(),
    supabase
      .from("site_assignments")
      .select("employee_id, is_primary")
      .eq("site_id", siteId)
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime, overtime_multiplier")
      .eq("site_id", siteId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
    supabase
      .from("site_needs")
      .select("day_of_week, headcount, start_time, end_time, is_critical, is_enabled")
      .eq("site_id", siteId)
      .eq("is_enabled", true),
  ]);

  const site = siteRow as SiteAnalyticsData["site"];
  if (!site) {
    return {
      site: null,
      members: [],
      memberIds: new Set(),
      shiftsOnSite: [],
      shiftsElsewhereForMembers: [],
      needs: [],
      leaves: [],
    };
  }

  // Phase 2 : queries dependant de phase 1
  const candidateIds = [
    ...new Set(((assignsRaw ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id)),
  ];
  const [{ data: empsRaw }, { data: shiftsElsewhereRaw }, { data: leavesRaw }] = await Promise.all([
    candidateIds.length > 0
      ? supabase
          .from("employees")
          .select("id, full_name, weekly_hours, status")
          .in("id", candidateIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; weekly_hours: number | null; status: string }> }),
    candidateIds.length > 0
      ? supabase
          .from("shifts")
          .select("id, employee_id, date, start_time, end_time, site_id, site:sites(code)")
          .in("employee_id", candidateIds)
          .neq("site_id", siteId)
          .gte("date", weekStart)
          .lte("date", weekEnd)
      : Promise.resolve({ data: [] as Array<{ id: string; employee_id: string; date: string; start_time: string; end_time: string; site_id: string | null; site: { code: string } | null }> }),
    candidateIds.length > 0
      ? supabase
          .from("time_off_requests")
          .select("employee_id, start_date, end_date, kind")
          .eq("status", "approved")
          .in("employee_id", candidateIds)
          .lte("start_date", weekEnd)
          .gte("end_date", weekStart)
      : Promise.resolve({ data: [] as Array<{ employee_id: string; start_date: string; end_date: string; kind: string }> }),
  ]);

  const members = (empsRaw ?? []) as SiteAnalyticsData["members"];
  const memberIds = new Set(members.map((e) => e.id));

  // Enrichit shifts du site avec full_name (pour SiteIncoherenceBanner)
  const empNameById = new Map(members.map((e) => [e.id, e.full_name] as const));
  const shiftsOnSite = ((shiftsOnSiteRaw ?? []) as Array<{
    id: string; employee_id: string; date: string; start_time: string; end_time: string;
    break_minutes: number; is_overtime: boolean | null; overtime_multiplier: number | null;
  }>).map((s) => ({
    ...s,
    full_name: empNameById.get(s.employee_id) ?? null,
  }));

  const shiftsElsewhereForMembers = ((shiftsElsewhereRaw ?? []) as Array<{
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    site_id: string | null;
    site: { code: string } | null;
  }>).map((s) => ({
    id: s.id,
    employee_id: s.employee_id,
    date: s.date,
    start_time: s.start_time,
    end_time: s.end_time,
    site_id: s.site_id,
    site_code: s.site?.code ?? null,
  }));

  return {
    site,
    members,
    memberIds,
    shiftsOnSite,
    shiftsElsewhereForMembers,
    needs: (needsRaw ?? []) as SiteAnalyticsData["needs"],
    leaves: (leavesRaw ?? []) as SiteAnalyticsData["leaves"],
  };
}
