// Auto-validation des congés — moteur de règles paramétrables
// (panneau /admin/settings/leave-rules).
//
// Règle d'or : si toutes les règles passent → auto_approve. Sinon, on
// escalade au manager (V1 : pas d'auto-reject — c'est une décision humaine).
//
// Les paramètres viennent de `org_settings` :
//   - leave_auto_min_notice_days        (préavis minimum, en jours)
//   - leave_auto_max_consecutive_days   (durée max auto-validable)
//   - leave_auto_max_pct_absents_per_site (% max d'absents simultanés sur site)
//   - leave_blocked_periods             (liste des périodes interdites)
//
// Périodes interdites possibles :
//   - 'sales'       → mois 01 ou 07 entiers
//   - 'year_end'    → 15 déc → 15 jan
//   - 'wed_sat'     → mercredi (3) et samedi (6) — jours forts boutique
//   - 'ramadan_aid' → tout jour qui tombe sur un holiday islamic priority>=2
//                     dans la table `holidays`, ou approximativement
//                     [début Ramadan ; Aïd al-Fitr+1].

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types publics

export type AutoValidationParams = {
  minNoticeDays: number;
  maxConsecutiveDays: number;
  maxPctAbsentsPerSite: number; // 0..100
  blockedPeriods: string[]; // 'sales' | 'year_end' | 'wed_sat' | 'ramadan_aid'
};

export type AutoValidationDetails = {
  noticeDays: number;
  consecutiveDays: number;
  blockedDates: Array<{ date: string; reason: string }>; // périodes interdites touchées
  maxAbsentsPct: number; // pic d'absentéisme observé (%)
  maxAbsentsDate: string | null;
  totalEmployeesOnSite: number | null;
};

export type AutoValidationResult = {
  shouldAutoValidate: boolean;
  reasons: string[]; // raisons d'échec ou ['all_rules_passed']
  recommendation: "auto_approve" | "auto_reject" | "escalate_to_manager";
  details: AutoValidationDetails;
};

export type EvaluateInput = {
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  kind: string;
  /** Si vrai, on ignore la demande courante dans le calcul du % absents
   *  (utile quand la demande vient juste d'être insérée). */
  excludeRequestId?: string;
};

// ---------------------------------------------------------------------------
// Helpers de période

const MS_PER_DAY = 86_400_000;

function parseISODate(iso: string): Date {
  // Évite tout décalage timezone : on travaille en UTC.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function diffDaysInclusive(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / MS_PER_DAY) + 1;
}

function eachDayBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let d = parseISODate(startISO);
  const last = parseISODate(endISO);
  while (d <= last) {
    out.push(toISODate(d));
    d = new Date(d.getTime() + MS_PER_DAY);
  }
  return out;
}

function dowUTC(iso: string): number {
  // 0 = Dim, 6 = Sam (cohérent avec Date.getDay et site_needs.day_of_week).
  return parseISODate(iso).getUTCDay();
}

function inSalesPeriod(iso: string): boolean {
  const m = iso.slice(5, 7);
  return m === "01" || m === "07";
}

function inYearEndPeriod(iso: string): boolean {
  const m = iso.slice(5, 7);
  const day = Number(iso.slice(8, 10));
  if (m === "12" && day >= 15) return true;
  if (m === "01" && day <= 15) return true;
  return false;
}

function isWedOrSat(iso: string): boolean {
  const dow = dowUTC(iso);
  return dow === 3 || dow === 6;
}

// ---------------------------------------------------------------------------
// Moteur principal

/**
 * Charge les paramètres auto-validation depuis `org_settings`.
 * Retombe sur les defaults Karim si la ligne / colonne est vide.
 */
export async function loadAutoValidationParams(): Promise<AutoValidationParams> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select(
      "leave_auto_min_notice_days, leave_auto_max_pct_absents_per_site, leave_auto_max_consecutive_days, leave_blocked_periods",
    )
    .eq("id", 1)
    .maybeSingle();
  const r = data as unknown as {
    leave_auto_min_notice_days: number | null;
    leave_auto_max_pct_absents_per_site: number | null;
    leave_auto_max_consecutive_days: number | null;
    leave_blocked_periods: string[] | null;
  } | null;
  return {
    minNoticeDays: r?.leave_auto_min_notice_days ?? 14,
    maxConsecutiveDays: r?.leave_auto_max_consecutive_days ?? 10,
    maxPctAbsentsPerSite: r?.leave_auto_max_pct_absents_per_site ?? 30,
    blockedPeriods: Array.isArray(r?.leave_blocked_periods)
      ? r!.leave_blocked_periods!
      : ["sales", "ramadan_aid", "year_end", "wed_sat"],
  };
}

/**
 * Charge les holidays islamic priority>=2 sur la plage demandée.
 * Pour `ramadan_aid`, on étend les dates entre "Début Ramadan" et "Aïd al-Fitr+1"
 * lorsqu'on les détecte ; les Aïd al-Adha sont eux ponctuels.
 */
async function getRamadanAidBlockedDates(
  startISO: string,
  endISO: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const blocked = new Set<string>();
  // On lit assez large autour de la plage pour attraper un Ramadan qui
  // démarre avant et finit pendant la fenêtre.
  const fromIso = toISODate(new Date(parseISODate(startISO).getTime() - 35 * MS_PER_DAY));
  const toIso = toISODate(new Date(parseISODate(endISO).getTime() + 35 * MS_PER_DAY));
  const { data } = await supabase
    .from("holidays")
    .select("date, label, tradition, priority, kind")
    .eq("is_active", true)
    .gte("date", fromIso)
    .lte("date", toIso)
    .order("date");
  type Row = {
    date: string;
    label: string | null;
    tradition: string | null;
    priority: number | null;
    kind: string | null;
  };
  const rows = ((data ?? []) as Row[]).filter(
    (h) => (h.tradition ?? "").toLowerCase() === "islamic" && (h.priority ?? 0) >= 2,
  );
  // Détecte les paires Ramadan→Aïd al-Fitr pour bloquer la fenêtre entière.
  // Stratégie pragmatique : tout "Début Ramadan" + tout "Aïd al-Fitr" trouvé
  // → on bloque la plage [début_ramadan, aïd_fitr+1].
  const ramadanStarts = rows.filter((r) => /ramadan/i.test(r.label ?? ""));
  const fitrs = rows.filter((r) => /fitr/i.test(r.label ?? ""));
  for (const start of ramadanStarts) {
    // Cherche le premier Aïd al-Fitr après ce début Ramadan.
    const after = fitrs.find((f) => f.date >= start.date);
    if (after) {
      const last = toISODate(new Date(parseISODate(after.date).getTime() + MS_PER_DAY));
      for (const d of eachDayBetween(start.date, last)) blocked.add(d);
    } else {
      // Pas de Aïd al-Fitr en base → on bloque +30j de sécurité.
      const fallback = toISODate(new Date(parseISODate(start.date).getTime() + 30 * MS_PER_DAY));
      for (const d of eachDayBetween(start.date, fallback)) blocked.add(d);
    }
  }
  // Aïd al-Adha (et autres priority>=2) : on bloque le jour J + j+1.
  for (const r of rows) {
    if (/ramadan/i.test(r.label ?? "") || /fitr/i.test(r.label ?? "")) continue;
    blocked.add(r.date);
    blocked.add(toISODate(new Date(parseISODate(r.date).getTime() + MS_PER_DAY)));
  }
  return blocked;
}

/**
 * Détermine pour chaque jour de [start..end] s'il tombe dans une période
 * interdite (selon `blockedPeriods`). Retourne la liste détaillée des dates
 * et raisons. Liste vide = aucun jour ne tombe en période interdite.
 */
async function findBlockedDates(
  startISO: string,
  endISO: string,
  blockedPeriods: string[],
): Promise<Array<{ date: string; reason: string }>> {
  const out: Array<{ date: string; reason: string }> = [];
  const ramadanSet = blockedPeriods.includes("ramadan_aid")
    ? await getRamadanAidBlockedDates(startISO, endISO)
    : new Set<string>();

  for (const date of eachDayBetween(startISO, endISO)) {
    if (blockedPeriods.includes("sales") && inSalesPeriod(date)) {
      out.push({ date, reason: "sales" });
      continue;
    }
    if (blockedPeriods.includes("year_end") && inYearEndPeriod(date)) {
      out.push({ date, reason: "year_end" });
      continue;
    }
    if (blockedPeriods.includes("wed_sat") && isWedOrSat(date)) {
      out.push({ date, reason: "wed_sat" });
      continue;
    }
    if (ramadanSet.has(date)) {
      out.push({ date, reason: "ramadan_aid" });
      continue;
    }
  }
  return out;
}

/**
 * Calcule le pic d'absentéisme prévu sur le site principal de l'employé
 * pour la fenêtre demandée. Compte tous les time_off_requests
 * approved+pending (sauf celui-ci) qui chevauchent chaque jour, et compare
 * au nombre total d'employés actifs sur ce site.
 *
 * Retourne `{ maxPct: -1 }` si l'employé n'a pas de site primaire — dans ce
 * cas, on skip ce critère (faute de référence d'effectif).
 */
async function computeMaxAbsentsPct(
  employeeId: string,
  startISO: string,
  endISO: string,
  excludeRequestId: string | undefined,
): Promise<{ maxPct: number; maxDate: string | null; total: number | null }> {
  const supabase = await createClient();
  // Site primaire de l'employé (V1 : on prend le premier is_primary actif).
  const { data: assignRaw } = await supabase
    .from("site_assignments")
    .select("site_id, start_date, end_date, is_primary")
    .eq("employee_id", employeeId)
    .lte("start_date", endISO)
    .or(`end_date.is.null,end_date.gte.${startISO}`)
    .order("is_primary", { ascending: false });
  const assigns = (assignRaw ?? []) as Array<{
    site_id: string;
    start_date: string;
    end_date: string | null;
    is_primary: boolean | null;
  }>;
  const primary = assigns.find((a) => a.is_primary) ?? assigns[0];
  if (!primary) return { maxPct: -1, maxDate: null, total: null };
  const siteId = primary.site_id;

  // Effectif total actif sur ce site sur la fenêtre.
  const { data: rosterRaw } = await supabase
    .from("site_assignments")
    .select("employee_id")
    .eq("site_id", siteId)
    .lte("start_date", endISO)
    .or(`end_date.is.null,end_date.gte.${startISO}`);
  const roster = new Set(
    ((rosterRaw ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id),
  );
  if (roster.size === 0) return { maxPct: -1, maxDate: null, total: null };
  // Filtre : seulement les employés actifs.
  const { data: activeRaw } = await supabase
    .from("employees")
    .select("id")
    .in("id", Array.from(roster))
    .eq("status", "active");
  const activeIds = new Set(((activeRaw ?? []) as Array<{ id: string }>).map((e) => e.id));
  const total = activeIds.size;
  if (total === 0) return { maxPct: -1, maxDate: null, total: 0 };

  // Time-off approved+pending qui chevauchent la fenêtre, employés du site.
  const { data: offRaw } = await supabase
    .from("time_off_requests")
    .select("id, employee_id, start_date, end_date, status")
    .in("employee_id", Array.from(activeIds))
    .in("status", ["approved", "pending"])
    .lte("start_date", endISO)
    .gte("end_date", startISO);
  const offs = ((offRaw ?? []) as Array<{
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    status: string;
  }>).filter((o) => o.id !== excludeRequestId);

  let maxAbs = 0;
  let maxDate: string | null = null;
  for (const date of eachDayBetween(startISO, endISO)) {
    let count = 0;
    for (const o of offs) {
      if (date >= o.start_date && date <= o.end_date) count += 1;
    }
    // +1 pour la demande courante (si l'employé fait partie du roster).
    const includeSelf = activeIds.has(employeeId) ? 1 : 0;
    const pct = ((count + includeSelf) / total) * 100;
    if (pct > maxAbs) {
      maxAbs = pct;
      maxDate = date;
    }
  }
  return { maxPct: maxAbs, maxDate, total };
}

/**
 * Évalue une demande de congé contre toutes les règles d'auto-validation.
 * Si toutes les règles passent → recommandation `auto_approve`.
 * Sinon → `escalate_to_manager` avec liste détaillée des raisons.
 */
export async function evaluateLeaveRequest(
  input: EvaluateInput,
): Promise<AutoValidationResult> {
  const params = await loadAutoValidationParams();
  return evaluateLeaveRequestWithParams(input, params);
}

/**
 * Variante exposée pour les tests / l'aperçu UI : on injecte les params
 * directement sans relire `org_settings` à chaque appel.
 */
export async function evaluateLeaveRequestWithParams(
  input: EvaluateInput,
  params: AutoValidationParams,
): Promise<AutoValidationResult> {
  const reasons: string[] = [];
  const today = toISODate(new Date());
  const noticeDays = Math.max(
    0,
    Math.round(
      (parseISODate(input.startDate).getTime() - parseISODate(today).getTime()) / MS_PER_DAY,
    ),
  );
  const consecutiveDays = diffDaysInclusive(input.startDate, input.endDate);

  // Règle 1 : préavis
  if (noticeDays < params.minNoticeDays) reasons.push("preavis_too_short");

  // Règle 2 : durée max
  if (consecutiveDays > params.maxConsecutiveDays) reasons.push("too_long");

  // Règle 3 : périodes interdites
  const blockedDates = await findBlockedDates(
    input.startDate,
    input.endDate,
    params.blockedPeriods,
  );
  if (blockedDates.length > 0) reasons.push("in_blocked_period");

  // Règle 4 : % absents simultanés (sur site primaire)
  const abs = await computeMaxAbsentsPct(
    input.employeeId,
    input.startDate,
    input.endDate,
    input.excludeRequestId,
  );
  if (abs.maxPct > params.maxPctAbsentsPerSite + 1e-6) reasons.push("too_many_absents");

  const details: AutoValidationDetails = {
    noticeDays,
    consecutiveDays,
    blockedDates,
    maxAbsentsPct: abs.maxPct < 0 ? 0 : Math.round(abs.maxPct * 10) / 10,
    maxAbsentsDate: abs.maxDate,
    totalEmployeesOnSite: abs.total,
  };

  if (reasons.length === 0) {
    return {
      shouldAutoValidate: true,
      reasons: ["all_rules_passed"],
      recommendation: "auto_approve",
      details,
    };
  }
  return {
    shouldAutoValidate: false,
    reasons,
    recommendation: "escalate_to_manager",
    details,
  };
}

// ---------------------------------------------------------------------------
// Helpers de présentation côté UI

const REASON_LABELS_FR: Record<string, string> = {
  all_rules_passed: "Tous les critères respectés",
  preavis_too_short: "Préavis trop court",
  too_long: "Durée trop longue",
  in_blocked_period: "Période bloquée (soldes / fin d'année / Ramadan-Aïd / mer-sam)",
  too_many_absents: "Trop d'absents simultanés sur le site",
  manual_override: "Décision manager",
  // période détaillée
  sales: "Soldes (jan/juil)",
  year_end: "Fin d'année (15 déc → 15 jan)",
  wed_sat: "Mercredi / samedi (jours forts boutique)",
  ramadan_aid: "Ramadan / Aïd",
};

export function describeAutoReason(code: string): string {
  return REASON_LABELS_FR[code] ?? code;
}
