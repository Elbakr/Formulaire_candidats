// Helpers serveur pour le pointage (clock-in / clock-out).
//
// Les vues SQL `clock_currently_in` et `clock_sessions` (migration
// 20260620000060_clock_presence.sql) fournissent l'essentiel de la lecture.

import { createClient } from "@/lib/supabase/server";

export type CurrentlyIn = {
  employee_id: string;
  last_entry_id: string;
  clock_in_at: string;
  site_id: string | null;
  shift_id: string | null;
  entry_method: string;
  full_name: string;
  profile_id: string | null;
  site_code: string | null;
  site_name: string | null;
  site_color: string | null;
  site_light_color: string | null;
};

export type ClockSession = {
  in_entry_id: string;
  out_entry_id: string | null;
  employee_id: string;
  site_id: string | null;
  shift_id: string | null;
  entry_method: string;
  clock_in_at: string;
  clock_out_at: string | null;
  duration_minutes: number | null;
};

/** Liste les présents (clock-in ouvert), groupés par site dans le caller si besoin. */
export async function loadCurrentlyIn(opts?: { siteId?: string }): Promise<CurrentlyIn[]> {
  const supabase = await createClient();
  let q = supabase.from("clock_currently_in").select("*");
  if (opts?.siteId) q = q.eq("site_id", opts.siteId);
  const { data } = await q.order("clock_in_at", { ascending: true });
  return (data ?? []) as unknown as CurrentlyIn[];
}

/** Sessions clock-in/out d'un employé sur les N derniers jours. */
export async function loadRecentSessions(
  employeeId: string,
  days = 7,
): Promise<ClockSession[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("clock_sessions")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("clock_in_at", since)
    .order("clock_in_at", { ascending: false });
  return (data ?? []) as unknown as ClockSession[];
}

/** Détermine le site « par défaut » à utiliser pour le clock-in d'un employé. */
export async function pickDefaultSiteId(employeeId: string): Promise<{
  siteId: string | null;
  shiftId: string | null;
  source: "shift_today" | "primary_assignment" | "any_assignment" | "none";
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Shift en cours / planifié aujourd'hui ?
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, site_id, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("date", today)
    .order("start_time", { ascending: true });

  if (shifts && shifts.length > 0) {
    // On prend le 1er shift du jour avec un site_id ; sinon le 1er.
    const withSite = shifts.find((s: { site_id: string | null }) => s.site_id);
    const chosen = withSite ?? shifts[0];
    return {
      siteId: (chosen as { site_id: string | null }).site_id ?? null,
      shiftId: (chosen as { id: string }).id,
      source: "shift_today",
    };
  }

  // 2) Affectation principale active aujourd'hui ?
  const { data: assigns } = await supabase
    .from("site_assignments")
    .select("site_id, is_primary, start_date, end_date")
    .eq("employee_id", employeeId)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("is_primary", { ascending: false })
    .order("start_date", { ascending: false });

  if (assigns && assigns.length > 0) {
    const primary = assigns.find((a: { is_primary: boolean }) => a.is_primary);
    if (primary) {
      return { siteId: (primary as { site_id: string }).site_id, shiftId: null, source: "primary_assignment" };
    }
    return {
      siteId: (assigns[0] as { site_id: string }).site_id,
      shiftId: null,
      source: "any_assignment",
    };
  }

  return { siteId: null, shiftId: null, source: "none" };
}

/** Tous les sites où un employé peut potentiellement pointer (assignations actives). */
export async function loadEmployeeSites(employeeId: string): Promise<
  Array<{ id: string; code: string; name: string; color: string | null; light_color: string | null; is_primary: boolean }>
> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("site_assignments")
    .select(`is_primary, site:sites(id, code, name, color, light_color)`)
    .eq("employee_id", employeeId)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("is_primary", { ascending: false });
  type Row = {
    is_primary: boolean;
    site: { id: string; code: string; name: string; color: string | null; light_color: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const map = new Map<string, { id: string; code: string; name: string; color: string | null; light_color: string | null; is_primary: boolean }>();
  for (const r of rows) {
    if (!r.site) continue;
    if (!map.has(r.site.id)) {
      map.set(r.site.id, { ...r.site, is_primary: r.is_primary });
    }
  }
  return [...map.values()];
}

/** Format "Xh YY" depuis des minutes. */
export function formatDurationMin(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}
