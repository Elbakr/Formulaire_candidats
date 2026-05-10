// Module 5 — Engine de calcul des recommandations de renouvellement CDD.
// Décision finale TOUJOURS humaine — l'engine prépare la fiche.

import { createAdminClient } from "@/lib/supabase/server";

export type Trend = "+" | "=" | "-";

export type RenewalRecommendation = {
  recommendation: "renew" | "do_not_renew" | "discuss";
  rationale: string;
  global_score: number;
  trends: {
    ponctualite_30d: Trend;
    fiabilite_30d: Trend;
    rating_30d: Trend;
    absences_30d: Trend;
  };
  site_load_forecast: Record<string, "under_staffed" | "balanced" | "over_staffed">;
};

const DEFAULT_WEIGHTS = {
  ponctualite: 25,
  fiabilite: 25,
  heures_vs_prevu: 20,
  absences: 15,
  rating_hebdo: 15,
  ventes: 0,
};

type Weights = typeof DEFAULT_WEIGHTS;

function delta(current: number, previous: number, threshold = 0.05): Trend {
  if (previous <= 0 && current <= 0) return "=";
  if (previous <= 0) return current > 0 ? "+" : "=";
  const diff = (current - previous) / Math.abs(previous);
  if (diff > threshold) return "+";
  if (diff < -threshold) return "-";
  return "=";
}

/**
 * Calcule un global_score 0–100 à partir des métriques + notes hebdo,
 * pondéré selon `org_settings.kpi_weights`.
 *
 * V1 simplifiée :
 *  - ponctualité = reliability_pct (% shifts done)
 *  - fiabilite = 100 - shifts_no_show / shifts_total * 100
 *  - heures_vs_prevu = coverage_pct
 *  - absences = pénalité linéaire selon nb d'absences imprévues 60 derniers jours
 *  - rating_hebdo = moyenne des 12 dernières semaines * 20
 *  - ventes = 0 (WooCommerce reporté)
 */
function computeGlobalScore(
  metrics: {
    reliability_pct: number;
    coverage_pct: number;
    shifts_total: number;
    shifts_no_show: number;
  },
  weeklyAvg: number | null,
  unplannedAbsences60d: number,
  weights: Weights,
): number {
  const ponctualite = Math.max(0, Math.min(100, metrics.reliability_pct ?? 100));
  const fiabilite = metrics.shifts_total > 0
    ? Math.max(0, 100 - (metrics.shifts_no_show / metrics.shifts_total) * 100)
    : 100;
  const heures = Math.max(0, Math.min(100, metrics.coverage_pct ?? 100));
  const absences = Math.max(0, 100 - unplannedAbsences60d * 15); // -15pts par absence
  const ratingHebdo = weeklyAvg != null ? Math.max(0, Math.min(100, weeklyAvg * 20)) : 60; // neutre = 60
  const ventes = 0;

  const totalWeight = weights.ponctualite + weights.fiabilite + weights.heures_vs_prevu
    + weights.absences + weights.rating_hebdo + weights.ventes;
  if (totalWeight <= 0) return 0;

  const weighted =
    ponctualite * weights.ponctualite +
    fiabilite * weights.fiabilite +
    heures * weights.heures_vs_prevu +
    absences * weights.absences +
    ratingHebdo * weights.rating_hebdo +
    ventes * weights.ventes;

  return Math.round((weighted / totalWeight) * 10) / 10;
}

/**
 * Estime la charge prévisionnelle sur les sites de l'employé.
 * V1 simplifiée : compare le nombre de shifts planifiés / site sur les 4
 * prochaines semaines au cumul des `site_needs.headcount`. < 80% = under_staffed,
 * 80–115% = balanced, > 115% = over_staffed.
 */
async function forecastSiteLoad(
  admin: ReturnType<typeof createAdminClient>,
  siteIds: string[],
): Promise<Record<string, "under_staffed" | "balanced" | "over_staffed">> {
  const out: Record<string, "under_staffed" | "balanced" | "over_staffed"> = {};
  if (siteIds.length === 0) return out;

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + 28 * 86_400_000);
  const horizonISO = horizon.toISOString().slice(0, 10);

  // Shifts planifiés sur l'horizon, par site.
  const { data: shifts } = await admin
    .from("shifts")
    .select("site_id, start_time, end_time, break_minutes, date")
    .in("site_id", siteIds)
    .gte("date", todayISO)
    .lte("date", horizonISO);
  type ShiftRow = {
    site_id: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    date: string;
  };
  const plannedHoursBySite = new Map<string, number>();
  for (const s of (shifts ?? []) as ShiftRow[]) {
    if (!s.site_id) continue;
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const minutes = eh * 60 + em - sh * 60 - sm - (s.break_minutes ?? 0);
    const hours = Math.max(0, minutes / 60);
    plannedHoursBySite.set(s.site_id, (plannedHoursBySite.get(s.site_id) ?? 0) + hours);
  }

  // Besoins hebdomadaires par site (cumul x 4 semaines).
  const { data: needs } = await admin
    .from("site_needs")
    .select("site_id, start_time, end_time, headcount")
    .in("site_id", siteIds);
  type NeedRow = {
    site_id: string;
    start_time: string;
    end_time: string;
    headcount: number;
  };
  const neededHoursBySite = new Map<string, number>();
  for (const n of (needs ?? []) as NeedRow[]) {
    const [sh, sm] = n.start_time.split(":").map(Number);
    const [eh, em] = n.end_time.split(":").map(Number);
    const slotHours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
    const weekly = slotHours * (n.headcount ?? 1);
    neededHoursBySite.set(n.site_id, (neededHoursBySite.get(n.site_id) ?? 0) + weekly * 4);
  }

  for (const sid of siteIds) {
    const planned = plannedHoursBySite.get(sid) ?? 0;
    const needed = neededHoursBySite.get(sid) ?? 0;
    if (needed <= 0) {
      out[sid] = "balanced";
      continue;
    }
    const ratio = planned / needed;
    if (ratio < 0.8) out[sid] = "under_staffed";
    else if (ratio > 1.15) out[sid] = "over_staffed";
    else out[sid] = "balanced";
  }
  return out;
}

export async function buildRenewalRecommendation(
  employeeId: string,
): Promise<RenewalRecommendation> {
  const admin = createAdminClient();

  // 1. Pondération KPI.
  const { data: settings } = await admin
    .from("org_settings")
    .select("kpi_weights")
    .eq("id", 1)
    .maybeSingle();
  const w = (settings?.kpi_weights ?? DEFAULT_WEIGHTS) as Weights;
  const weights: Weights = {
    ponctualite: Number(w.ponctualite ?? DEFAULT_WEIGHTS.ponctualite),
    fiabilite: Number(w.fiabilite ?? DEFAULT_WEIGHTS.fiabilite),
    heures_vs_prevu: Number(w.heures_vs_prevu ?? DEFAULT_WEIGHTS.heures_vs_prevu),
    absences: Number(w.absences ?? DEFAULT_WEIGHTS.absences),
    rating_hebdo: Number(w.rating_hebdo ?? DEFAULT_WEIGHTS.rating_hebdo),
    ventes: Number(w.ventes ?? DEFAULT_WEIGHTS.ventes),
  };

  // 2. Métriques actuelles.
  const { data: metricsRow } = await admin
    .from("employee_metrics")
    .select("reliability_pct, coverage_pct, shifts_total, shifts_done, shifts_no_show")
    .eq("employee_id", employeeId)
    .maybeSingle();
  const metrics = {
    reliability_pct: Number(metricsRow?.reliability_pct ?? 100),
    coverage_pct: Number(metricsRow?.coverage_pct ?? 100),
    shifts_total: Number(metricsRow?.shifts_total ?? 0),
    shifts_no_show: Number(metricsRow?.shifts_no_show ?? 0),
  };

  // 3. Tendances 30j vs 30j précédents.
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const iso30 = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const iso60 = new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  // Shifts (ponctualité = % done, fiabilité = 1 - no_show ratio).
  const { data: shifts30 } = await admin
    .from("shifts")
    .select("status")
    .eq("employee_id", employeeId)
    .gte("date", iso30)
    .lte("date", isoToday);
  const { data: shifts60 } = await admin
    .from("shifts")
    .select("status")
    .eq("employee_id", employeeId)
    .gte("date", iso60)
    .lt("date", iso30);

  type ShiftMini = { status: string };
  const ponct = (rows: ShiftMini[]) => {
    if (rows.length === 0) return 100;
    const done = rows.filter((r) => r.status === "done").length;
    return (done / rows.length) * 100;
  };
  const fiab = (rows: ShiftMini[]) => {
    if (rows.length === 0) return 100;
    const noShow = rows.filter((r) => r.status === "no_show" || r.status === "cancelled").length;
    return Math.max(0, 100 - (noShow / rows.length) * 100);
  };
  const ponct30 = ponct((shifts30 ?? []) as ShiftMini[]);
  const ponctPrev = ponct((shifts60 ?? []) as ShiftMini[]);
  const fiab30 = fiab((shifts30 ?? []) as ShiftMini[]);
  const fiabPrev = fiab((shifts60 ?? []) as ShiftMini[]);

  // Notes hebdo (rating).
  const { data: ratings } = await admin
    .from("weekly_employee_ratings")
    .select("rating, week_monday")
    .eq("employee_id", employeeId)
    .gte("week_monday", iso60)
    .order("week_monday", { ascending: false });
  const ratingsArr = (ratings ?? []) as Array<{ rating: number; week_monday: string }>;
  const r30 = ratingsArr.filter((r) => r.week_monday >= iso30);
  const rPrev = ratingsArr.filter((r) => r.week_monday < iso30);
  const avg = (arr: { rating: number }[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b.rating, 0) / arr.length;
  const rating30 = avg(r30);
  const ratingPrev = avg(rPrev);

  // Absences imprévues.
  const { data: absences } = await admin
    .from("unplanned_absences")
    .select("date")
    .eq("employee_id", employeeId)
    .gte("date", iso60);
  const absArr = (absences ?? []) as Array<{ date: string }>;
  const abs30 = absArr.filter((a) => a.date >= iso30).length;
  const absPrev = absArr.filter((a) => a.date < iso30).length;

  const trends = {
    ponctualite_30d: delta(ponct30, ponctPrev),
    fiabilite_30d: delta(fiab30, fiabPrev),
    rating_30d: delta(rating30, ratingPrev),
    // pour absences, plus = pire → on inverse
    absences_30d: delta(abs30, absPrev) === "+" ? "-" : delta(abs30, absPrev) === "-" ? "+" : "=" as Trend,
  };

  // 4. Score global (rating moyen sur les 12 dernières semaines pour un signal stable).
  const iso12w = new Date(today.getTime() - 84 * 86_400_000).toISOString().slice(0, 10);
  const { data: rating12w } = await admin
    .from("weekly_employee_ratings")
    .select("rating")
    .eq("employee_id", employeeId)
    .gte("week_monday", iso12w);
  const rating12wArr = (rating12w ?? []) as Array<{ rating: number }>;
  const weeklyAvg = rating12wArr.length > 0
    ? rating12wArr.reduce((a, b) => a + b.rating, 0) / rating12wArr.length
    : null;
  const globalScore = computeGlobalScore(
    metrics,
    weeklyAvg,
    absArr.length, // 60 derniers jours
    weights,
  );

  // 5. Charge prévisionnelle des sites.
  const { data: assigns } = await admin
    .from("site_assignments")
    .select("site_id, sites(code, name)")
    .eq("employee_id", employeeId)
    .or(`end_date.is.null,end_date.gte.${isoToday}`);
  type AssignRow = {
    site_id: string;
    sites: { code: string; name: string } | null;
  };
  const assignArr = (assigns ?? []) as unknown as AssignRow[];
  const siteIds = [...new Set(assignArr.map((a) => a.site_id).filter(Boolean))];
  const loadById = await forecastSiteLoad(admin, siteIds);
  const siteLoadForecast: Record<string, "under_staffed" | "balanced" | "over_staffed"> = {};
  for (const a of assignArr) {
    if (!a.site_id) continue;
    const code = a.sites?.code ?? a.site_id.slice(0, 6);
    siteLoadForecast[code] = loadById[a.site_id] ?? "balanced";
  }

  // 6. Recommandation.
  const hasUnderStaffed = Object.values(siteLoadForecast).includes("under_staffed");
  const hasBalanced = Object.values(siteLoadForecast).includes("balanced");
  const recurrentAbsences = absArr.length >= 4;

  let recommendation: "renew" | "do_not_renew" | "discuss";
  if (globalScore <= 50 || recurrentAbsences) {
    recommendation = "do_not_renew";
  } else if (globalScore >= 75 && (hasUnderStaffed || hasBalanced)) {
    recommendation = "renew";
  } else {
    recommendation = "discuss";
  }

  // 7. Rationale explicable.
  const rationaleLines: string[] = [];
  rationaleLines.push(
    recommendation === "renew"
      ? `Score global ${globalScore.toFixed(0)}/100 : profil solide.`
      : recommendation === "do_not_renew"
      ? `Score global ${globalScore.toFixed(0)}/100 : signaux insuffisants pour un renouvellement.`
      : `Score global ${globalScore.toFixed(0)}/100 : profil correct mais sans certitude. Échange recommandé.`,
  );
  rationaleLines.push(
    `Ponctualité ${trends.ponctualite_30d === "+" ? "en progrès" : trends.ponctualite_30d === "-" ? "en baisse" : "stable"} sur 30 jours, fiabilité ${trends.fiabilite_30d === "+" ? "en progrès" : trends.fiabilite_30d === "-" ? "en baisse" : "stable"}.`,
  );
  if (weeklyAvg != null) {
    rationaleLines.push(
      `Note hebdo manager moyenne ${weeklyAvg.toFixed(1)}/5 sur les 12 dernières semaines (${rating12wArr.length} semaines notées).`,
    );
  } else {
    rationaleLines.push("Pas encore de note hebdo manager — KPI rating considéré neutre.");
  }
  if (absArr.length > 0) {
    rationaleLines.push(
      `${absArr.length} absence${absArr.length > 1 ? "s" : ""} imprévue${absArr.length > 1 ? "s" : ""} sur 60 jours.`,
    );
  }
  const siteEntries = Object.entries(siteLoadForecast);
  if (siteEntries.length > 0) {
    const labelMap: Record<string, string> = {
      under_staffed: "sous-staffé",
      balanced: "équilibré",
      over_staffed: "sur-staffé",
    };
    rationaleLines.push(
      `Charge prévisionnelle 4 prochaines semaines : ${siteEntries
        .map(([code, load]) => `${code} ${labelMap[load]}`)
        .join(", ")}.`,
    );
  }

  return {
    recommendation,
    rationale: rationaleLines.join(" "),
    global_score: globalScore,
    trends,
    site_load_forecast: siteLoadForecast,
  };
}
