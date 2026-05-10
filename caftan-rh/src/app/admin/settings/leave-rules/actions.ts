"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  evaluateLeaveRequestWithParams,
  type AutoValidationParams,
} from "@/lib/leave-auto-validation";

const ALLOWED_PERIODS = ["sales", "ramadan_aid", "year_end", "wed_sat"] as const;

export async function updateLeaveAutoSettingsAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const minNotice = clampInt(formData.get("min_notice_days"), 0, 365, 14);
  const maxPct = clampInt(formData.get("max_pct_absents"), 0, 100, 30);
  const maxConsec = clampInt(formData.get("max_consecutive"), 1, 365, 10);
  const periods = ALLOWED_PERIODS.filter(
    (p) => formData.get(`period_${p}`) === "on",
  );

  const { error } = await supabase
    .from("org_settings")
    .update({
      leave_auto_min_notice_days: minNotice,
      leave_auto_max_pct_absents_per_site: maxPct,
      leave_auto_max_consecutive_days: maxConsec,
      leave_blocked_periods: periods,
    })
    .eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings/leave-rules");
  revalidatePath("/admin/settings");
  return { ok: true };
}

function clampInt(
  v: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Aperçu rétrospectif : combien de demandes des 30 derniers jours auraient
 * été auto-validées avec les paramètres fournis (ou ceux en base si non passé).
 *
 * Conservateur : on rejoue le moteur sur les vraies données (holidays / absents
 * actuels), donc c'est une estimation, pas une vérité absolue.
 */
export async function previewAutoValidationStats(
  params?: AutoValidationParams,
): Promise<{
  total: number;
  wouldAutoApprove: number;
  wouldEscalate: number;
  windowDays: number;
}> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const sinceMs = Date.now() - 30 * 86_400_000;
  const since = new Date(sinceMs).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("time_off_requests")
    .select("id, employee_id, start_date, end_date, kind, status, created_at")
    .gte("created_at", since)
    .neq("kind", "sick")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    kind: string;
    status: string;
    created_at: string;
  }>;

  let auto = 0;
  let esc = 0;
  // Charge params si non fourni.
  let p = params;
  if (!p) {
    const { data: settings } = await supabase
      .from("org_settings")
      .select(
        "leave_auto_min_notice_days, leave_auto_max_pct_absents_per_site, leave_auto_max_consecutive_days, leave_blocked_periods",
      )
      .eq("id", 1)
      .maybeSingle();
    const r = settings as unknown as {
      leave_auto_min_notice_days: number | null;
      leave_auto_max_pct_absents_per_site: number | null;
      leave_auto_max_consecutive_days: number | null;
      leave_blocked_periods: string[] | null;
    } | null;
    p = {
      minNoticeDays: r?.leave_auto_min_notice_days ?? 14,
      maxConsecutiveDays: r?.leave_auto_max_consecutive_days ?? 10,
      maxPctAbsentsPerSite: r?.leave_auto_max_pct_absents_per_site ?? 30,
      blockedPeriods: Array.isArray(r?.leave_blocked_periods)
        ? r!.leave_blocked_periods!
        : ["sales", "ramadan_aid", "year_end", "wed_sat"],
    };
  }

  for (const r of rows) {
    try {
      const res = await evaluateLeaveRequestWithParams(
        {
          employeeId: r.employee_id,
          startDate: r.start_date,
          endDate: r.end_date,
          kind: r.kind,
          excludeRequestId: r.id,
        },
        p,
      );
      if (res.shouldAutoValidate) auto += 1;
      else esc += 1;
    } catch {
      esc += 1;
    }
  }

  return {
    total: rows.length,
    wouldAutoApprove: auto,
    wouldEscalate: esc,
    windowDays: 30,
  };
}
