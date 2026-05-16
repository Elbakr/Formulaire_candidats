"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { startOfWeek, parseISODate, addDays, toISODate, weekRange } from "@/lib/planning";
import {
  loadRushProfile,
  calcSlotRushIntensity,
  RUSH_INTENSITY_PEAK_THRESHOLD,
  type RushSegment,
} from "@/lib/rush-profile";
import { seniorTier } from "@/lib/tenure";
import { loadSeasonalEvents, pickPeakMultiplierForDay } from "@/lib/seasonal";
import {
  computeCrescendoMultiplier,
  computePontMultiplier,
  dayPriorityScore,
} from "@/lib/holidays-crescendo";
import { isRuleEnabled, mergeWithDefaults } from "@/lib/autoplaner-rules";

type SiteNeed = {
  id: string;
  day_of_week: number; // 0=Dim..6=Sam
  start_time: string;  // "HH:MM:SS"
  end_time: string;
  headcount: number;
  role: string | null;
  is_critical: number; // 0=normal, 1=critique, 2=ultra-critique
  is_enabled: boolean; // false = creneau eteint, ignore par le solver
};

type EmployeeRow = {
  id: string;
  full_name: string;
  status: string;
  fixed_off_days: number[] | null;
  default_pause_minutes: number | null;
  weekly_hours: number | null;
  start_date: string | null;
  contract_type: string | null;
  ot_eligible: boolean | null;
  ot_max_multiplier: number | null;
  is_manager: boolean | null;
  is_site_manager: boolean | null;
};

/** Score de séniorité numérique pour le tri (haut = plus senior). */
function seniorScore(e: EmployeeRow): number {
  const t = seniorTier(e.start_date, e.contract_type);
  switch (t) {
    case "lead": return 4;
    case "senior": return 3;
    case "confirme": return 2;
    case "junior": return 1;
  }
}

type ExistingShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_overtime: boolean;
};

type Off = {
  employee_id: string;
  start_date: string;
  end_date: string;
};

type EmpUnavail = {
  employee_id: string;
  // Récurrente : day_of_week ∈ 0..6 (0=Dim..6=Sam, cohérent avec Date.getDay()).
  day_of_week: number | null;
  // Ponctuelle : date précise (XOR avec day_of_week).
  date_specific: string | null;
  // Créneau optionnel ; si null+null sur une indispo ponctuelle, journée entière.
  start_time: string | null;
  end_time: string | null;
};

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// --- helpers temps ---------------------------------------------------------

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return timeToMin(aS) < timeToMin(bE) && timeToMin(aE) > timeToMin(bS);
}

/** Durée d'un créneau (heures, sans pause). */
function slotHours(start: string, end: string): number {
  return Math.max(0, timeToMin(end) - timeToMin(start)) / 60;
}

/** Durée nette d'un shift (heures, pause déduite) — pour comptage contractuel. */
function netShiftHours(start: string, end: string, breakMin: number): number {
  return Math.max(0, (timeToMin(end) - timeToMin(start) - breakMin) / 60);
}

// --- types public ----------------------------------------------------------

export type SitePlanPreview = {
  drafts: Array<{
    employee_id: string;
    employee_name: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    position: string | null;
    site_id: string;
    need_id: string;
    /** True si l'employé n'est PAS assigné à ce site — renfort cross-site. */
    is_renfort: boolean;
    /** Tier de sélection : 1=primary, 2=secondaire, 3=externe libre. */
    pool_tier: 1 | 2 | 3;
    /** True si ce shift dépasse les heures contractuelles (phase 2). */
    is_overtime: boolean;
    /** Multiplicateur du contractuel (1.25 / 1.5 / 2.0) pour audit, sinon null. */
    overtime_multiplier: number | null;
  }>;
  uncovered: Array<{
    date: string;
    day_label: string;
    start_time: string;
    end_time: string;
    role: string | null;
    missing: number;
    /**
     * Cause principale : 'no_hours_left' (plafond contractuel atteint partout),
     * 'all_off' (tous off ou en congé), 'all_busy' (conflit shift/draft),
     * 'closed' (fermeture/férié — ne devrait pas remonter ici car filtré),
     * 'mixed' (combinaison). Sert de hint à l'UI pour proposer le bouton overtime.
     */
    reason: string;
  }>;
  weekStart: string;
  weekEnd: string;
  /** Stats d'utilisation contractuelle par employé pour le bandeau UI. */
  contract_usage: Array<{
    employee_id: string;
    employee_name: string;
    weekly_hours: number;
    used_hours_this_plan: number;
    used_hours_total_week: number; // existing + drafts
    days_planned: number;
  }>;
  /**
   * Événements saisonniers (peak) qui ont gonflé l'effectif requis cette
   * semaine. Sert à expliquer dans l'UI pourquoi la barre de besoins est
   * plus haute que d'habitude.
   */
  seasonal_active?: Array<{
    name: string;
    kind: "peak" | "low" | "closed";
    multiplier: number;
    days_in_week: number;
  }>;
};

// --- chargement données partagé phase 1 / phase 2 -------------------------

type SolverContext = {
  siteId: string;
  monday: Date;
  start: string;
  end: string;
  needs: SiteNeed[];
  allEmployees: EmployeeRow[];
  tierByEmp: Map<string, 1 | 2 | 3>;
  existing: ExistingShift[];
  offs: Off[];
  unavail: EmpUnavail[];
  blockedDates: Set<string>;
  /**
   * Jours speciaux (holidays.shops_closed=false) : magasins OUVERTS, force
   * assignation. Le solver IGNORE fixed_off_days sur ces dates, sauf vrai
   * conge (time_off_request) ou indispo declaree.
   */
  specialDates: Set<string>;
  /**
   * Multiplicateur d'effectif par date (rush pre-Aid, soldes, etc.). Le solver
   * multiplie need.headcount par cette valeur les jours concernes (en plus
   * du multiplier saisonnier classique). Default 1.0.
   */
  holidayStaffMultByDate: Map<string, number>;
  /**
   * Liste brute des feries de la fenetre (utilise pour le crescendo J-7 avant
   * les 2 prochaines fetes -- Karim 14/05/2026).
   */
  allHolidays: Array<{
    date: string;
    priority: number | null;
    kind: string | null;
    shops_closed: boolean | null;
    staff_multiplier: number | string | null;
  }>;
  closedDates: Set<string>;
};

async function loadSolverContext(
  siteCode: string,
  weekISO: string,
): Promise<SolverContext | { error: string }> {
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, code")
    .eq("code", siteCode.toUpperCase())
    .maybeSingle();
  if (!site) return { error: "Site introuvable." };
  const siteId = (site as { id: string }).id;

  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);

  const [
    { data: needsRaw },
    { data: siteAssignsRaw },
    { data: allActiveEmpsRaw },
    { data: shiftsRaw },
    { data: offRaw },
    { data: closures },
    { data: holidays },
    { data: unavailRaw },
  ] = await Promise.all([
    supabase
      .from("site_needs")
      .select("id, day_of_week, start_time, end_time, headcount, role, is_critical, is_enabled")
      .eq("site_id", siteId)
      // Le solver ignore les creneaux eteints (is_enabled=false). RH peut les
      // rallumer ponctuellement via /planning/sites/[code] besoins-editor.
      .eq("is_enabled", true)
      // Les besoins ultra-critiques (is_critical=2) sont traités en premier,
      // puis les critiques (1), puis les normaux (0). Permet au solver de
      // garantir la couverture des creneaux indispensables avant le reste.
      .order("is_critical", { ascending: false })
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("site_assignments")
      .select("employee_id, is_primary")
      .eq("site_id", siteId)
      .lte("start_date", end)
      .or(`end_date.is.null,end_date.gte.${start}`),
    supabase
      .from("employees")
      .select(
        "id, full_name, status, fixed_off_days, default_pause_minutes, weekly_hours, start_date, contract_type, ot_eligible, ot_max_multiplier, is_manager, is_site_manager",
      )
      .eq("status", "active"),
    // /!\ on charge TOUS les shifts de la semaine, pas seulement ceux du site,
    // car le calcul des heures contractuelles consommées doit cumuler tous les
    // shifts de l'employé (y.c. autres sites).
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes, is_overtime")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("company_closures")
      .select("start_date, end_date, department_id")
      .lte("start_date", end)
      .gte("end_date", start),
    // Politique magasins Caftan (Karim 2026-05-11 v3) : seuls les jours J
    // d'Aid (Aid al-Fitr + Aid al-Adha) sont fermes (shops_closed=true). Le
    // J+1 d'Aid est ouvert ; le J-1 d'Aid est ouvert avec staff_multiplier
    // (1.5 normal, 2.0 si coincidence avec autre ferie international). Tous
    // les autres feries restent ouverts en force-assignation.
    supabase
      .from("holidays")
      .select("date, priority, kind, shops_closed, staff_multiplier")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end),
    // Indispos déclarées par les employés (récurrentes + ponctuelles sur la
    // semaine). Ces contraintes sont consommées par le solver dans isAvailable.
    supabase
      .from("employee_unavailabilities")
      .select("employee_id, day_of_week, date_specific, start_time, end_time, is_active")
      .eq("is_active", true)
      .or(`date_specific.is.null,and(date_specific.gte.${start},date_specific.lte.${end})`),
  ]);

  const needs = (needsRaw ?? []) as SiteNeed[];
  if (needs.length === 0)
    return { error: "Aucun besoin défini pour ce site (site_needs vide)." };

  const tierByEmp = new Map<string, 1 | 2 | 3>();
  for (const a of (siteAssignsRaw ?? []) as Array<{
    employee_id: string;
    is_primary: boolean;
  }>) {
    tierByEmp.set(a.employee_id, a.is_primary ? 1 : 2);
  }

  const allEmployees = ((allActiveEmpsRaw ?? []) as EmployeeRow[]).filter(
    (e) => e.status === "active",
  );
  if (allEmployees.length === 0)
    return {
      error: "Aucun employé actif sur la plateforme. Crée d'abord des employés.",
    };

  const existing = (shiftsRaw ?? []) as ExistingShift[];
  const offs = (offRaw ?? []) as Off[];
  const allHolidays = (holidays ?? []) as Array<{
    date: string;
    priority: number | null;
    kind: string | null;
    shops_closed: boolean | null;
    staff_multiplier: number | string | null;
  }>;
  // shops_closed=true -> magasins fermes (Aid uniquement par defaut).
  // Tous les autres feries actifs -> specialDates (force-assignation, OFF ignore).
  const blockedDates = new Set(
    allHolidays.filter((h) => h.shops_closed === true).map((h) => h.date),
  );
  const specialDates = new Set(
    allHolidays.filter((h) => h.shops_closed !== true).map((h) => h.date),
  );
  // Map des multiplicateurs d'effectif par date (rush pre-Aid, soldes, etc.).
  // Si plusieurs feries tombent le meme jour, on prend le max (le plus exigeant).
  const holidayStaffMultByDate = new Map<string, number>();
  for (const h of allHolidays) {
    const m = h.staff_multiplier == null ? 1.0 : Number(h.staff_multiplier);
    if (Number.isFinite(m) && m > 1.0) {
      const cur = holidayStaffMultByDate.get(h.date) ?? 1.0;
      if (m > cur) holidayStaffMultByDate.set(h.date, m);
    }
  }
  const closedDates = new Set<string>();
  for (const c of (closures ?? []) as Array<{
    start_date: string;
    end_date: string;
  }>) {
    let d = parseISODate(c.start_date);
    const last = parseISODate(c.end_date);
    while (d <= last) {
      closedDates.add(toISODate(d));
      d = addDays(d, 1);
    }
  }

  const unavail = ((unavailRaw ?? []) as EmpUnavail[]).filter(
    (u) =>
      // Sécurité : l'OR Supabase au-dessus charge tout date_specific NULL ;
      // on garde seulement celles dans la fenêtre OU récurrentes.
      u.day_of_week !== null ||
      (u.date_specific !== null && u.date_specific >= start && u.date_specific <= end),
  );

  return {
    siteId,
    monday,
    start,
    end,
    needs,
    allEmployees,
    tierByEmp,
    existing,
    offs,
    unavail,
    blockedDates,
    specialDates,
    holidayStaffMultByDate,
    allHolidays,
    closedDates,
  };
}

// --- helpers métier (off / congé / conflit) -------------------------------

function isOffOrLeave(
  e: EmployeeRow,
  dateISO: string,
  dayJsDow: number,
  offs: Off[],
  specialDates?: Set<string>,
): boolean {
  // Convention employees.fixed_off_days : 0=Lun..6=Dim ; Date.getDay() = 0=Dim.
  const isoDow = dayJsDow === 0 ? 6 : dayJsDow - 1;
  // Force-assignation jours speciaux (Aid, Ramadan, Soldes, ...) : on ignore
  // l'OFF hebdo, le travailleur est presume disponible sauf vrai conge.
  const isSpecial = specialDates?.has(dateISO) ?? false;
  if (!isSpecial && (e.fixed_off_days ?? []).includes(isoDow)) return true;
  return offs.some(
    (o) =>
      o.employee_id === e.id &&
      dateISO >= o.start_date &&
      dateISO <= o.end_date,
  );
}

function hasConflict(
  empId: string,
  dateISO: string,
  start: string,
  end: string,
  shifts: Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }>,
): boolean {
  return shifts.some(
    (s) =>
      s.employee_id === empId &&
      s.date === dateISO &&
      overlaps(s.start_time, s.end_time, start, end),
  );
}

/**
 * Vrai si une indispo déclarée (récurrente ou ponctuelle) chevauche le
 * créneau [needS, needE] pour l'employé `empId` à la date `dateISO`.
 * - Récurrence : day_of_week match Date.getDay() (0=Dim..6=Sam).
 * - Ponctuelle : date_specific === dateISO.
 * - Si start_time/end_time sont null, l'indispo couvre la journée entière.
 */
function hasUnavailabilityOverlap(
  empId: string,
  dateISO: string,
  dayJsDow: number,
  needS: string,
  needE: string,
  unavail: EmpUnavail[],
): boolean {
  return unavail.some((u) => {
    if (u.employee_id !== empId) return false;
    const matchesDay =
      u.day_of_week === dayJsDow || u.date_specific === dateISO;
    if (!matchesDay) return false;
    // Sans bornes horaires → journée entière → tout shift overlap.
    if (!u.start_time || !u.end_time) return true;
    return overlaps(u.start_time, u.end_time, needS, needE);
  });
}

// --- phase 1 : génération contractuelle stricte ---------------------------

export async function previewSitePlanAction(
  siteCode: string,
  weekISO: string,
  /**
   * Karim 16/05 : shifts virtuels deja alloues a cet employe par d autres
   * sites du meme batch multi-sites. Le solver les inclut dans plannedHours/
   * plannedDays/conflicts comme si c etaient des shifts en base. Sans ce
   * parametre, le 1er site du batch raflait tous les employes (combinedMult
   * x2 sur 4 besoins = 8 employes, 13 dispo -> tout sur 1 site, les autres
   * vides). Avec : repartition equitable.
   */
  additionalExistingShifts?: ExistingShift[],
): Promise<SitePlanPreview | { error: string }> {
  await requireRole(["admin", "rh", "manager"]);

  const ctx = await loadSolverContext(siteCode, weekISO);
  if ("error" in ctx) return ctx;
  const {
    siteId,
    monday,
    start,
    end,
    needs,
    allEmployees,
    tierByEmp,
    existing: existingFromDb,
    offs,
    unavail,
    blockedDates,
    specialDates,
    holidayStaffMultByDate,
    allHolidays,
    closedDates,
  } = ctx;
  // Merge des shifts en base + drafts virtuels des sites precedents du batch.
  const existing: ExistingShift[] = additionalExistingShifts
    ? [...existingFromDb, ...additionalExistingShifts]
    : existingFromDb;

  // Coefficients de rush horaire (AUTOPLAN_RULES) — décision Karim 2026-05-09.
  // Si rush_use_in_solver=false dans org_settings, on désactive complètement
  // la pondération : le solver retombe sur l'ancien comportement (équité pure).
  const supabaseRush = await createClient();
  const { data: orgRushRow } = await supabaseRush
    .from("org_settings")
    .select("rush_use_in_solver, autoplaner_rules")
    .eq("id", 1)
    .maybeSingle();
  const rushEnabled = (orgRushRow as { rush_use_in_solver?: boolean | null } | null)
    ?.rush_use_in_solver !== false;
  // Karim 15/05 v5 : config centrale des regles autoplaner (toggles).
  const rulesCfg = mergeWithDefaults(
    ((orgRushRow as { autoplaner_rules?: Record<string, unknown> | null } | null)
      ?.autoplaner_rules ?? null),
  );
  let rushSegments: RushSegment[] = [];
  if (rushEnabled) {
    try {
      rushSegments = await loadRushProfile(siteId);
    } catch (e) {
      console.warn("[preview] rush profile load failed, falling back to neutral:", (e as Error).message);
      rushSegments = [];
    }
  }

  // Saisonnalités : on charge les événements actifs qui chevauchent la semaine
  // pour appliquer un multiplicateur d'effectif sur les jours en pic
  // (Ramadan/Aïd/Soldes/Noël…). Best-effort : si l'appel échoue, on continue
  // sans multiplier (planning normal).
  let seasonalEventsList: Awaited<ReturnType<typeof loadSeasonalEvents>> = [];
  try {
    seasonalEventsList = await loadSeasonalEvents(start, end);
  } catch (e) {
    console.warn("[preview] seasonal events load failed:", (e as Error).message);
    seasonalEventsList = [];
  }
  // Compteur d'usage des seasonal pour le retour (audit côté UI).
  const seasonalDaysCount = new Map<string, { event: typeof seasonalEventsList[number]; days: number }>();

  // Compteurs par employé (cumul existant + drafts en cours de calcul).
  const plannedHours = new Map<string, number>(); // heures NETTES déjà comptées
  const plannedDays = new Map<string, Set<string>>(); // dates où l'employé a au moins 1 shift
  for (const e of allEmployees) {
    plannedHours.set(e.id, 0);
    plannedDays.set(e.id, new Set());
  }
  // 1) Initialisation depuis les shifts EXISTANTS (toutes affectations).
  for (const s of existing) {
    plannedHours.set(
      s.employee_id,
      (plannedHours.get(s.employee_id) ?? 0) +
        netShiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
    );
    const set = plannedDays.get(s.employee_id) ?? new Set<string>();
    set.add(s.date);
    plannedDays.set(s.employee_id, set);
  }

  const drafts: SitePlanPreview["drafts"] = [];
  const uncovered: SitePlanPreview["uncovered"] = [];

  // Itère sur les 7 jours de la semaine dans l ORDRE CHRONOLOGIQUE (lundi -> dimanche).
  // Karim 14/05 avait demande "priorisant toujours les jours speciaux", j avais
  // implemente un tri par priorite DESC. Karim 15/05 a constate la regression :
  // les jours speciaux (samedi/dimanche/feries) saturaient les quotas hebdo
  // des employes en premier, et lundi/mardi/mercredi se retrouvaient SANS
  // AUCUN candidat eligible (HARD CAP plannedHours + slotH <= weekly_hours).
  // Solution : retour ordre chronologique pour la boucle, le renforcement
  // des jours critiques reste assure par combinedMult (holiday + crescendo +
  // pont + seasonal) qui gonfle le headcount sur ces jours specifiquement.
  // Regle fondamentale Karim 2026-05-13 : aucune generation < J+1.
  const tomorrowISO = toISODate(addDays(new Date(), 1));

  const allHolidaysForCrescendo = allHolidays.map((h) => ({
    date: h.date,
    priority: h.priority,
    kind: h.kind,
    shops_closed: h.shops_closed,
    staff_multiplier: h.staff_multiplier,
  }));

  const daysOrder: Array<{ dateISO: string; dayJsDow: number; priority: number }> = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(monday, i);
    const dateISO = toISODate(dayDate);
    const dayJsDow = dayDate.getDay();
    const priority = dayPriorityScore(dateISO, allHolidaysForCrescendo);
    daysOrder.push({ dateISO, dayJsDow, priority });
  }
  // Pas de tri : ordre chronologique strict (lundi -> dimanche).

  for (const { dateISO, dayJsDow } of daysOrder) {
    if (dateISO < tomorrowISO) continue;
    if (blockedDates.has(dateISO) || closedDates.has(dateISO)) continue;

    // Multiplier saisonnier (peak) — gonfle headcount sur les jours du pic.
    const { multiplier: seasonalMult, event: seasonalEvt } = pickPeakMultiplierForDay(
      seasonalEventsList,
      dateISO,
    );
    if (seasonalEvt) {
      const cur = seasonalDaysCount.get(seasonalEvt.id);
      if (cur) cur.days += 1;
      else seasonalDaysCount.set(seasonalEvt.id, { event: seasonalEvt, days: 1 });
    }

    // Trie les besoins du jour par durée décroissante.
    const dayNeeds = needs
      .filter((n) => n.day_of_week === dayJsDow)
      .sort(
        (a, b) =>
          slotHours(b.start_time, b.end_time) - slotHours(a.start_time, a.end_time),
      );

    // Multiplicateur d'effectif final.
    // Karim 16/05 : holiday, crescendo et pont sont 3 INTENSIFICATIONS du
    // meme phenomene (jour ferie qui amene du trafic) : on prend le MAX
    // des 3, pas le produit. Puis on multiplie par le saisonnier (Ramadan,
    // soldes -- evenement different) -- la c est legitime de cumuler.
    // Plafond combine 2.0x (avant : 4.0 -> produisait des cibles d effectif
    // x4 qui absorbaient tous les employes sur 1 site, vidant les autres).
    const holidayStaffMultEnabled = isRuleEnabled(rulesCfg, "holiday_staff_multiplier");
    const holidayMult = holidayStaffMultEnabled
      ? (holidayStaffMultByDate.get(dateISO) ?? 1.0)
      : 1.0;
    const seasonalEnabled = isRuleEnabled(rulesCfg, "seasonal_peak_multiplier");
    const effectiveSeasonalMult = seasonalEnabled ? seasonalMult : 1.0;
    const crescendoEnabled = isRuleEnabled(rulesCfg, "crescendo_before_holidays");
    const crescendo = crescendoEnabled
      ? computeCrescendoMultiplier(dateISO, allHolidaysForCrescendo)
      : { multiplier: 1.0, reason: null };
    const pont = computePontMultiplier(dateISO, allHolidaysForCrescendo);
    // Pont a plusieurs sous-regles : on les check separement selon le label
    // retourne. Si la regle correspondante est OFF, pont = 1.0.
    let pontMult = pont.multiplier;
    if (pont.reason) {
      const r = pont.reason;
      const enabled =
        (r.includes("Pont vendredi") && isRuleEnabled(rulesCfg, "pont_friday_after_thursday")) ||
        (r.includes("Pont lundi") && isRuleEnabled(rulesCfg, "pont_monday_before_tuesday")) ||
        ((r.includes("Samedi avant") || r.includes("Dimanche avant") || r.includes("Mardi après")) &&
          isRuleEnabled(rulesCfg, "pont_weekend_extended_monday"));
      if (!enabled) pontMult = 1.0;
    }
    // MAX des 3 facteurs feries (holiday/crescendo/pont) puis x saisonnier.
    const holidayMaxMult = Math.max(holidayMult, crescendo.multiplier, pontMult);
    const combinedMult = Math.min(
      2.0,
      effectiveSeasonalMult * holidayMaxMult,
    );

    for (const need of dayNeeds) {
      const need_s = need.start_time.slice(0, 5);
      const need_e = need.end_time.slice(0, 5);
      const slotH = slotHours(need_s, need_e); // brut (sans pause)
      // Karim 16/05 v6 : le boost de headcount est plafonne a +1 EMPLOYE
      // par besoin (au lieu de multiplier need.headcount). Sans ce cap,
      // un besoin de 4 employes avec combinedMult=2.0 ciblait 8 employes
      // sur le meme site -> le solver tassait 8 sur le 1er site visite,
      // les sites suivants restaient vides (test 25 mai : B=8, D=0).
      // Avec le cap +1 : B=5, A=3, D=4, E=4 -> repartition realiste pour
      // 13 employes actifs sur 4 sites. Le jour de pic reste reconnu
      // (boost +1) sans devorer la disponibilite globale.
      const targetWithMult = Math.ceil(need.headcount * combinedMult);
      const seasonalHeadcount = Math.min(
        targetWithMult,
        need.headcount + 1,
      );

      // Pool unique des employés éligibles, filtrés sur :
      //   - off / congé
      //   - conflit avec shift existant ou autre draft
      //   - HARD CAP contractuel : plannedHours + slotH <= weekly_hours
      const eligible: EmployeeRow[] = [];
      let countOff = 0;
      let countBusy = 0;
      let countCapped = 0;
      let countAvailable = 0;
      for (const e of allEmployees) {
        if (isOffOrLeave(e, dateISO, dayJsDow, offs, specialDates)) {
          countOff += 1;
          continue;
        }
        // Indispos déclarées par l'employé (cours, examen, perso…) : si une
        // indispo chevauche le créneau, on l'exclut comme s'il était off.
        if (hasUnavailabilityOverlap(e.id, dateISO, dayJsDow, need_s, need_e, unavail)) {
          countOff += 1;
          continue;
        }
        if (hasConflict(e.id, dateISO, need_s, need_e, existing)) {
          countBusy += 1;
          continue;
        }
        if (
          hasConflict(
            e.id,
            dateISO,
            need_s,
            need_e,
            drafts.map((d) => ({
              employee_id: d.employee_id,
              date: d.date,
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          )
        ) {
          countBusy += 1;
          continue;
        }
        // HARD CAP contractuel (phase 1) : ne dépasse JAMAIS weekly_hours.
        const cap = e.weekly_hours ?? 38;
        const used = plannedHours.get(e.id) ?? 0;
        // On compare en heures brutes (slotH) car la pause contractuelle est
        // déjà incluse dans le créneau du besoin — l'employé réserve le slot
        // entier sur sa semaine. C'est volontairement conservateur : si on
        // veut tirer plus de monde, c'est exactement le rôle de la phase 2.
        if (used + slotH > cap + 1e-6) {
          countCapped += 1;
          continue;
        }
        countAvailable += 1;
        eligible.push(e);
      }

      // Tri global :
      //   (a) heures contractuelles restantes — déjà filtré (hard cap).
      //   (b) tier d'assignation (1 < 2 < 3 = renfort cross-site = dernier).
      //   (c) si créneau de PIC (rush_intensity ≥ seuil) : senior > junior.
      //   (d) moins de jours déjà planifiés cette semaine (étalement).
      //   (e) moins d'heures déjà planifiées (équité).
      //
      // Le critère (c) s'active UNIQUEMENT quand rush_use_in_solver=true et
      // que le créneau dépasse le seuil de pic. Pour les créneaux creux (10h-12h
      // par ex.), on garde l'ancien comportement (équité simple).
      const rushIntensity = rushEnabled
        ? calcSlotRushIntensity(rushSegments, need_s, need_e)
        : 0;
      const isPeakSlot = rushIntensity >= RUSH_INTENSITY_PEAK_THRESHOLD;
      // Boost priorite (decision Karim 2026-05-11) : on prend les seniors
      // d'office sur les creneaux a haute exigence client.
      const isWeekend = dayJsDow === 0 || dayJsDow === 6;
      const isThuAtE = dayJsDow === 4 && siteCode.toUpperCase() === "E";
      const isSpecialDay = specialDates.has(dateISO);
      const isCriticalNeed = (need.is_critical ?? 0) > 0;
      const requireSenior =
        isPeakSlot || isWeekend || isThuAtE || isSpecialDay || isCriticalNeed;

      // Karim 15/05 v2 : managers/site_managers priorises EN PREMIER pour
      // l epuisement de leur reserve contractuelle. Respecte rules toggles
      // manager_priority + site_manager_priority.
      const mgrPriorityEnabled = isRuleEnabled(rulesCfg, "manager_priority");
      const siteMgrPriorityEnabled = isRuleEnabled(rulesCfg, "site_manager_priority");
      eligible.sort((a, b) => {
        const rRank = (e: EmployeeRow) => {
          if (siteMgrPriorityEnabled && e.is_site_manager) return 0;
          if (mgrPriorityEnabled && e.is_manager) return 1;
          return 2;
        };
        const ra = rRank(a);
        const rb = rRank(b);
        if (ra !== rb) return ra - rb;
        const ta = tierByEmp.get(a.id) ?? 3;
        const tb = tierByEmp.get(b.id) ?? 3;
        if (ta !== tb) return ta - tb;
        if (requireSenior && isRuleEnabled(rulesCfg, "senior_first_on_demanding_slots")) {
          // Creneau a forte exigence : senior d'abord (lead/senior > confirme/junior).
          const sa = seniorScore(a);
          const sb = seniorScore(b);
          if (sa !== sb) return sb - sa;
        }
        const da = plannedDays.get(a.id)?.size ?? 0;
        const db = plannedDays.get(b.id)?.size ?? 0;
        if (da !== db) return da - db;
        const ha = plannedHours.get(a.id) ?? 0;
        const hb = plannedHours.get(b.id) ?? 0;
        return ha - hb;
      });

      let remaining = seasonalHeadcount;
      for (const emp of eligible) {
        if (remaining <= 0) break;
        const tier = (tierByEmp.get(emp.id) ?? 3) as 1 | 2 | 3;
        drafts.push({
          employee_id: emp.id,
          employee_name: emp.full_name,
          date: dateISO,
          start_time: need_s,
          end_time: need_e,
          break_minutes: emp.default_pause_minutes ?? 30,
          position: need.role,
          site_id: siteId,
          need_id: need.id,
          is_renfort: tier === 3,
          pool_tier: tier,
          is_overtime: false,
          overtime_multiplier: null,
        });
        // Comptage : on incrémente en heures brutes (slotH) pour rester
        // cohérent avec le HARD CAP qui filtre en brut.
        plannedHours.set(emp.id, (plannedHours.get(emp.id) ?? 0) + slotH);
        const set = plannedDays.get(emp.id) ?? new Set<string>();
        set.add(dateISO);
        plannedDays.set(emp.id, set);
        remaining -= 1;
      }

      const missing = remaining;
      if (missing > 0) {
        // Détermine la cause principale pour suggérer overtime ou non.
        let reason = "mixed";
        if (countAvailable === 0) {
          if (countCapped > 0 && countOff === 0 && countBusy === 0)
            reason = "no_hours_left";
          else if (countOff > 0 && countCapped === 0 && countBusy === 0)
            reason = "all_off";
          else if (countBusy > 0 && countCapped === 0 && countOff === 0)
            reason = "all_busy";
          else if (countCapped > 0) reason = "hours_capped";
        } else {
          // Pool dispo mais pas assez nombreux pour `headcount`.
          reason = "not_enough_staff";
        }
        uncovered.push({
          date: dateISO,
          day_label: DAYS_FR[dayJsDow],
          start_time: need_s,
          end_time: need_e,
          role: need.role,
          missing,
          reason,
        });
      }
    }
  }

  // Construction du résumé d'utilisation contractuelle (bandeau UI).
  const usagePerEmp = new Map<string, number>();
  for (const d of drafts) {
    usagePerEmp.set(
      d.employee_id,
      (usagePerEmp.get(d.employee_id) ?? 0) + slotHours(d.start_time, d.end_time),
    );
  }
  const contract_usage: SitePlanPreview["contract_usage"] = allEmployees
    .filter(
      (e) =>
        (usagePerEmp.get(e.id) ?? 0) > 0 ||
        (plannedDays.get(e.id)?.size ?? 0) > 0,
    )
    .map((e) => ({
      employee_id: e.id,
      employee_name: e.full_name,
      weekly_hours: e.weekly_hours ?? 38,
      used_hours_this_plan: usagePerEmp.get(e.id) ?? 0,
      used_hours_total_week: plannedHours.get(e.id) ?? 0,
      days_planned: plannedDays.get(e.id)?.size ?? 0,
    }));

  // Audit saisonnier — log + retour pour l'UI.
  const seasonal_active = Array.from(seasonalDaysCount.values()).map((s) => ({
    name: s.event.name,
    kind: s.event.kind,
    multiplier: s.event.staff_multiplier ?? 1,
    days_in_week: s.days,
  }));
  if (seasonal_active.length > 0) {
    console.log(
      `[preview] semaine ${start} → ${end} : ${seasonal_active.length} saisonnalité(s) actives :`,
      seasonal_active.map((s) => `${s.name} ×${s.multiplier} sur ${s.days_in_week}j`).join(", "),
    );
  }

  return {
    drafts,
    uncovered,
    weekStart: start,
    weekEnd: end,
    contract_usage,
    seasonal_active,
  };
}

// --- phase 2 : overtime opt-in --------------------------------------------

const ALLOWED_MULTIPLIERS = [1.0, 1.25, 1.5, 2.0] as const;

/**
 * @deprecated Remplacé depuis le 2026-05-11 par le workflow case-par-case
 * (`proposeOvertimeCandidatesAction` + `commitIndividualOvertimeAction`).
 * Conservé en l'état comme fallback rapide en cas de besoin urgent. Ne PAS
 * utiliser pour de nouveaux flows : Karim a explicitement choisi de gérer
 * les heures sup individu-par-individu, pas via un multiplier global.
 */
export async function previewOvertimeFillAction(args: {
  siteCode: string;
  weekISO: string;
  baseDrafts: SitePlanPreview["drafts"];
  multiplier: number;
}): Promise<SitePlanPreview | { error: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const { siteCode, weekISO, baseDrafts, multiplier } = args;

  if (!ALLOWED_MULTIPLIERS.includes(multiplier as 1.0 | 1.25 | 1.5 | 2.0)) {
    return {
      error: `Multiplicateur ${multiplier} non autorisé. Utilise 1.0, 1.25, 1.5 ou 2.0.`,
    };
  }

  const ctx = await loadSolverContext(siteCode, weekISO);
  if ("error" in ctx) return ctx;
  const {
    siteId,
    monday,
    start,
    end,
    needs,
    allEmployees,
    tierByEmp,
    existing,
    offs,
    unavail,
    blockedDates,
    specialDates,
    holidayStaffMultByDate,
    closedDates,
  } = ctx;

  // Lit la pause minimale entre contractuel et OT depuis org_settings (15 min
  // par défaut — règle Karim 2026-05-11).
  const supabase = await createClient();
  const { data: orgRow } = await supabase
    .from("org_settings")
    .select("overtime_min_pause_minutes, autoplaner_rules")
    .eq("id", 1)
    .maybeSingle();
  const otMinPause =
    (orgRow as { overtime_min_pause_minutes?: number | null } | null)
      ?.overtime_min_pause_minutes ?? 15;
  const rulesCfg = mergeWithDefaults(
    (orgRow as { autoplaner_rules?: Record<string, unknown> | null } | null)
      ?.autoplaner_rules ?? null,
  );

  // Compteurs initialisés depuis l'EXISTANT (autres sites + ce site déjà commités).
  // plannedHours = total des heures productives (regulier + OT).
  // contractualHours = heures REGULIERES uniquement (utilise pour decider du
  // fractionnement automatique en phase 2 -- Karim 2026-05-14).
  const plannedHours = new Map<string, number>();
  const contractualHours = new Map<string, number>();
  const plannedDays = new Map<string, Set<string>>();
  for (const e of allEmployees) {
    plannedHours.set(e.id, 0);
    contractualHours.set(e.id, 0);
    plannedDays.set(e.id, new Set());
  }
  for (const s of existing) {
    const h = netShiftHours(s.start_time, s.end_time, s.break_minutes ?? 0);
    plannedHours.set(s.employee_id, (plannedHours.get(s.employee_id) ?? 0) + h);
    if (!s.is_overtime) {
      contractualHours.set(
        s.employee_id,
        (contractualHours.get(s.employee_id) ?? 0) + h,
      );
    }
    const set = plannedDays.get(s.employee_id) ?? new Set<string>();
    set.add(s.date);
    plannedDays.set(s.employee_id, set);
  }
  // Ajoute les baseDrafts (phase 1) au compteur — ils sont notre point de
  // depart. Tous les baseDrafts sont reguliers par construction.
  for (const d of baseDrafts) {
    const h = slotHours(d.start_time, d.end_time);
    plannedHours.set(d.employee_id, (plannedHours.get(d.employee_id) ?? 0) + h);
    contractualHours.set(
      d.employee_id,
      (contractualHours.get(d.employee_id) ?? 0) + h,
    );
    const set = plannedDays.get(d.employee_id) ?? new Set<string>();
    set.add(d.date);
    plannedDays.set(d.employee_id, set);
  }

  // Liste virtuelle des shifts pris en compte pour le test de conflit (existing
  // + baseDrafts). Les nouveaux drafts OT se rajoutent au fur et à mesure.
  const allShiftsForConflict: Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }> = [
    ...existing.map((s) => ({
      employee_id: s.employee_id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
    })),
    ...baseDrafts.map((d) => ({
      employee_id: d.employee_id,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  ];

  // Index des fins de shift contractuel par (empId, dateISO) pour calculer
  // l'heure minimale du shift OT du même jour (fin contractuel + pause).
  // On garde le MAX des fins de shift contractuel ce jour-là (le solver pose
  // l'OT après tout shift existant ou de phase 1).
  const lastEndByDay = new Map<string, number>(); // key = `${empId}|${date}`, value = minutes
  function noteEnd(empId: string, dateISO: string, end: string) {
    const key = `${empId}|${dateISO}`;
    const cur = lastEndByDay.get(key) ?? -1;
    const m = timeToMin(end);
    if (m > cur) lastEndByDay.set(key, m);
  }
  for (const s of existing) noteEnd(s.employee_id, s.date, s.end_time);
  for (const d of baseDrafts) noteEnd(d.employee_id, d.date, d.end_time);

  // Reconstruit les drafts OT à partir des besoins encore uncovered (compte
  // tenu de baseDrafts), tout en autorisant les employés à dépasser leur
  // contractuel jusqu'à `weekly_hours × multiplier`.
  const otDrafts: SitePlanPreview["drafts"] = [];
  const uncovered: SitePlanPreview["uncovered"] = [];

  // Regle fondamentale Karim 2026-05-13 : on ne propose pas d'OT pour le passe.
  const tomorrowISOphase2a = toISODate(addDays(new Date(), 1));

  for (let dow = 0; dow < 7; dow++) {
    const dayDate = (() => {
      const offset = dow === 0 ? 6 : dow - 1;
      return addDays(monday, offset);
    })();
    const dateISO = toISODate(dayDate);
    const dayJsDow = dayDate.getDay();

    if (dateISO < tomorrowISOphase2a) continue;
    if (blockedDates.has(dateISO) || closedDates.has(dateISO)) continue;

    const dayNeeds = needs
      .filter((n) => n.day_of_week === dayJsDow)
      .sort(
        (a, b) =>
          slotHours(b.start_time, b.end_time) - slotHours(a.start_time, a.end_time),
      );

    for (const need of dayNeeds) {
      const need_s = need.start_time.slice(0, 5);
      const need_e = need.end_time.slice(0, 5);
      const need_eMin = timeToMin(need_e);

      // Combien de baseDrafts couvrent déjà ce besoin ?
      const alreadyCovered = baseDrafts.filter(
        (d) =>
          d.date === dateISO &&
          d.need_id === need.id,
      ).length;
      const remainingBase = need.headcount - alreadyCovered;
      if (remainingBase <= 0) continue;

      // Pool d'employés autorisés en overtime sur ce créneau :
      //   - pas off/congé
      //   - pas de conflit avec un shift existant ou un draft phase 1/2
      //   - cumul actuel + slot effectif <= weekly_hours × multiplier
      // Pour le shift OT, on déduit la pause de 15 min après le contractuel
      // si l'employé a déjà bossé ce jour-là (= shift existant ou phase 1).
      const candidates: Array<{
        emp: EmployeeRow;
        otStart: string;
        otEnd: string;
        otHours: number;
      }> = [];
      let countOff = 0;
      let countBusy = 0;
      let countCapped = 0;
      for (const e of allEmployees) {
        if (isOffOrLeave(e, dateISO, dayJsDow, offs, specialDates)) {
          countOff += 1;
          continue;
        }
        // Indispos déclarées par l'employé : on respecte aussi en phase 2.
        if (hasUnavailabilityOverlap(e.id, dateISO, dayJsDow, need_s, need_e, unavail)) {
          countOff += 1;
          continue;
        }
        // Détermine l'heure de début effective du shift OT sur ce jour :
        // si l'employé a déjà bossé ce jour, on cale après son dernier shift
        // + pause minimale ; sinon on prend le début du besoin tel quel.
        const lastEnd = lastEndByDay.get(`${e.id}|${dateISO}`) ?? -1;
        let otStartMin = timeToMin(need_s);
        if (lastEnd >= 0) {
          const minStart = lastEnd + otMinPause;
          if (minStart > otStartMin) otStartMin = minStart;
        }
        // Le shift OT doit tenir dans le créneau : il commence à
        // max(need_s, lastEnd+15) et finit à need_e. Si la fenêtre devient
        // vide ou trop courte (<15 min), l'employé est inéligible.
        if (otStartMin >= need_eMin - 15) {
          countBusy += 1;
          continue;
        }
        const otStart = minToHHMM(otStartMin);
        const otEnd = need_e;
        // Conflit avec un autre shift de l'employé sur le même jour ?
        if (hasConflict(e.id, dateISO, otStart, otEnd, allShiftsForConflict)) {
          countBusy += 1;
          continue;
        }
        const otH = (need_eMin - otStartMin) / 60;
        // Karim 15/05 : cap personnel boosté par flags manager/site_manager.
        // Respecte rules toggles : si manager_ot_boost_2x ou
        // site_manager_ot_boost_2_5x OFF, le boost de role est neutralise
        // (1.0) et seul ot_max_multiplier personnel s applique.
        const baseMax = Math.max(1.0, e.ot_max_multiplier ?? 1.0);
        const siteMgrBoostOn = isRuleEnabled(rulesCfg, "site_manager_ot_boost_2_5x");
        const mgrBoostOn = isRuleEnabled(rulesCfg, "manager_ot_boost_2x");
        const roleBoost =
          siteMgrBoostOn && e.is_site_manager
            ? 2.5
            : mgrBoostOn && e.is_manager
              ? 2.0
              : 1.0;
        const personalMaxMult = Math.max(baseMax, roleBoost);
        const effectiveMult = Math.min(multiplier, personalMaxMult);
        const cap = (e.weekly_hours ?? 38) * effectiveMult;
        const used = plannedHours.get(e.id) ?? 0;
        if (used + otH > cap + 1e-6) {
          countCapped += 1;
          continue;
        }
        candidates.push({ emp: e, otStart, otEnd, otHours: otH });
      }

      // Tri : Karim 15/05 v2 : priorite manager/site_manager EN PREMIER
      // (ils doivent absorber l overload en cas de besoin extreme), PUIS
      // etalement, puis moins d heures cumulees, puis tier.
      // roleRank : 0=site_manager, 1=manager, 2=normal.
      // Respecte rules toggles.
      const mgrPriorityEnabledOT = isRuleEnabled(rulesCfg, "manager_priority");
      const siteMgrPriorityEnabledOT = isRuleEnabled(rulesCfg, "site_manager_priority");
      function roleRank(e: EmployeeRow): number {
        if (siteMgrPriorityEnabledOT && e.is_site_manager) return 0;
        if (mgrPriorityEnabledOT && e.is_manager) return 1;
        return 2;
      }
      candidates.sort((a, b) => {
        const ra = roleRank(a.emp);
        const rb = roleRank(b.emp);
        if (ra !== rb) return ra - rb;
        const da = plannedDays.get(a.emp.id)?.size ?? 0;
        const db = plannedDays.get(b.emp.id)?.size ?? 0;
        if (da !== db) return da - db;
        const ha = plannedHours.get(a.emp.id) ?? 0;
        const hb = plannedHours.get(b.emp.id) ?? 0;
        if (ha !== hb) return ha - hb;
        const ta = tierByEmp.get(a.emp.id) ?? 3;
        const tb = tierByEmp.get(b.emp.id) ?? 3;
        return ta - tb;
      });

      let remaining = remainingBase;
      for (const c of candidates) {
        if (remaining <= 0) break;
        const tier = (tierByEmp.get(c.emp.id) ?? 3) as 1 | 2 | 3;

        // Fractionnement automatique (Karim 2026-05-14) : si l employe a
        // encore de la reserve contractuelle, on l epuise d abord puis on
        // bascule en OT au-dela. Voir splitShiftForQuota() pour la regle.
        const empWeekly = c.emp.weekly_hours ?? 38;
        const contractualUsed = contractualHours.get(c.emp.id) ?? 0;
        const remainingContract = Math.max(0, empWeekly - contractualUsed);

        const otStartMin = timeToMin(c.otStart);

        // Decoupage : on prend min(slot, reserve) en contractuel, le reste en OT.
        // Pas de pause sur les segments OT (pause deja consommee avant via
        // otStartMin = lastEnd + otMinPause).
        const baseShiftFields = {
          employee_id: c.emp.id,
          employee_name: c.emp.full_name,
          date: dateISO,
          break_minutes: 0,
          position: need.role,
          site_id: siteId,
          need_id: need.id,
          is_renfort: tier === 3,
          pool_tier: tier as 1 | 2 | 3,
        };

        if (remainingContract >= c.otHours - 0.001) {
          // Tout le slot tient dans le contractuel : 1 shift regulier
          otDrafts.push({
            ...baseShiftFields,
            start_time: c.otStart,
            end_time: c.otEnd,
            is_overtime: false,
            overtime_multiplier: null,
          });
          contractualHours.set(c.emp.id, contractualUsed + c.otHours);
          allShiftsForConflict.push({
            employee_id: c.emp.id,
            date: dateISO,
            start_time: c.otStart,
            end_time: c.otEnd,
          });
          noteEnd(c.emp.id, dateISO, c.otEnd);
        } else if (remainingContract > 0.001) {
          // Split : segment 1 contractuel, segment 2 OT
          const splitMin = otStartMin + Math.round(remainingContract * 60);
          const splitHHMM = minToHHMM(splitMin);
          otDrafts.push({
            ...baseShiftFields,
            start_time: c.otStart,
            end_time: splitHHMM,
            is_overtime: false,
            overtime_multiplier: null,
          });
          otDrafts.push({
            ...baseShiftFields,
            start_time: splitHHMM,
            end_time: c.otEnd,
            is_overtime: true,
            overtime_multiplier: multiplier,
          });
          contractualHours.set(c.emp.id, contractualUsed + remainingContract);
          allShiftsForConflict.push({
            employee_id: c.emp.id,
            date: dateISO,
            start_time: c.otStart,
            end_time: c.otEnd,
          });
          noteEnd(c.emp.id, dateISO, c.otEnd);
        } else {
          // Aucune reserve : 1 shift full OT (comportement historique)
          otDrafts.push({
            ...baseShiftFields,
            start_time: c.otStart,
            end_time: c.otEnd,
            break_minutes: c.emp.default_pause_minutes ?? 30,
            is_overtime: true,
            overtime_multiplier: multiplier,
          });
          allShiftsForConflict.push({
            employee_id: c.emp.id,
            date: dateISO,
            start_time: c.otStart,
            end_time: c.otEnd,
          });
          noteEnd(c.emp.id, dateISO, c.otEnd);
        }

        plannedHours.set(c.emp.id, (plannedHours.get(c.emp.id) ?? 0) + c.otHours);
        const set = plannedDays.get(c.emp.id) ?? new Set<string>();
        set.add(dateISO);
        plannedDays.set(c.emp.id, set);
        remaining -= 1;
      }

      if (remaining > 0) {
        let reason = "mixed";
        if (candidates.length === 0) {
          if (countCapped > 0 && countOff === 0 && countBusy === 0)
            reason = "no_hours_left_overtime";
          else if (countOff > 0) reason = "all_off";
          else if (countBusy > 0) reason = "all_busy";
          else reason = "no_one_available";
        } else {
          reason = "not_enough_staff";
        }
        uncovered.push({
          date: dateISO,
          day_label: DAYS_FR[dayJsDow],
          start_time: need_s,
          end_time: need_e,
          role: need.role,
          missing: remaining,
          reason,
        });
      }
    }
  }

  // Préview combiné : baseDrafts (phase 1) + otDrafts (phase 2). Les
  // contract_usage prennent en compte phase 1 + phase 2 pour le bandeau UI.
  const combined: SitePlanPreview["drafts"] = [...baseDrafts, ...otDrafts];

  const usagePerEmp = new Map<string, number>();
  for (const d of combined) {
    usagePerEmp.set(
      d.employee_id,
      (usagePerEmp.get(d.employee_id) ?? 0) + slotHours(d.start_time, d.end_time),
    );
  }
  const contract_usage: SitePlanPreview["contract_usage"] = allEmployees
    .filter(
      (e) =>
        (usagePerEmp.get(e.id) ?? 0) > 0 ||
        (plannedDays.get(e.id)?.size ?? 0) > 0,
    )
    .map((e) => ({
      employee_id: e.id,
      employee_name: e.full_name,
      weekly_hours: e.weekly_hours ?? 38,
      used_hours_this_plan: usagePerEmp.get(e.id) ?? 0,
      used_hours_total_week: plannedHours.get(e.id) ?? 0,
      days_planned: plannedDays.get(e.id)?.size ?? 0,
    }));

  return {
    drafts: combined,
    uncovered,
    weekStart: start,
    weekEnd: end,
    contract_usage,
  };
}

// --- commit -----------------------------------------------------------------

export async function commitSitePlanAction(
  drafts: SitePlanPreview["drafts"],
): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  new_shift_ids?: string[];
}> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!Array.isArray(drafts) || drafts.length === 0)
    return { error: "Aucun shift à créer." };
  const supabase = await createClient();

  // ANTI-DOUBLE-BOOKING (Karim 2026-05-13) : un employe ne peut pas etre a
  // 2 endroits en meme temps. Le solver par site calcule chaque site
  // independamment. Au commit (sequentiel multi-sites), on charge tous les
  // shifts existants des employes concernes sur les dates concernees, et
  // on SKIP les drafts qui chevauchent un shift deja en DB.
  const empIds = Array.from(new Set(drafts.map((d) => d.employee_id)));
  const dates = drafts.map((d) => d.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const { data: existingRaw } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time")
    .in("employee_id", empIds)
    .gte("date", minDate)
    .lte("date", maxDate);
  const existing = (existingRaw ?? []) as Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }>;
  const byEmpDate = new Map<string, Array<{ start: string; end: string }>>();
  for (const s of existing) {
    const k = `${s.employee_id}|${s.date}`;
    const arr = byEmpDate.get(k) ?? [];
    arr.push({ start: s.start_time, end: s.end_time });
    byEmpDate.set(k, arr);
  }

  const accepted: typeof drafts = [];
  let skipped = 0;
  for (const d of drafts) {
    const k = `${d.employee_id}|${d.date}`;
    const existingForKey = byEmpDate.get(k) ?? [];
    const hasOverlap = existingForKey.some((e) => d.start_time < e.end && d.end_time > e.start);
    if (hasOverlap) {
      skipped += 1;
      continue;
    }
    accepted.push(d);
    // Marque ce draft comme "deja pris" pour les drafts suivants du meme batch
    existingForKey.push({ start: d.start_time, end: d.end_time });
    byEmpDate.set(k, existingForKey);
  }

  if (accepted.length === 0) {
    return {
      error: `Tous les drafts (${drafts.length}) chevauchent des shifts deja existants. Probable double-booking entre sites. Re-genere la preview.`,
      skipped,
    };
  }

  const rows = accepted.map((d) => ({
    employee_id: d.employee_id,
    site_id: d.site_id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    break_minutes: d.break_minutes,
    position: d.position,
    location: null as string | null,
    status: "planned" as const,
    created_by: profile.id,
    is_overtime: !!d.is_overtime,
    overtime_multiplier: d.is_overtime ? d.overtime_multiplier : null,
  }));

  // .select() pour recuperer les ids inseres (rollback ulterieur).
  const { data, error } = await supabase.from("shifts").insert(rows).select("id");
  if (error) return { error: error.message };
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: rows.length, skipped, new_shift_ids: ids };
}

// --- phase 2bis : overtime case-par-case (workflow 2026-05-11 v2) --------
// Karim ne veut PAS d'un multiplier global. Pour chaque créneau uncovered, il
// regarde la liste des candidats triés et autorise individuellement (ou pas)
// chaque employé à un niveau précis (×1.25 / ×1.5 / ×2). Pas d'autorisation =
// pas de shift créé. C'est lui qui décide qui dépasse, et de combien.

export type OvertimeCandidate = {
  employee_id: string;
  employee_name: string;
  /** Heures contractuelles déjà planifiées sur la semaine (existing + drafts phase 1). */
  current_planned_hours: number;
  weekly_hours_target: number;
  /** Vrai si l'employé peut physiquement prendre ce créneau (pas de conflit / off / congé). */
  available_for_this_slot: boolean;
  /** Si pas dispo : 'conflict' | 'in_off' | 'off_day' | 'in_leave' | 'in_unavail'. */
  reason_unavailable?: string;
  pool_tier: 1 | 2 | 3;
  /**
   * Heure de début effective du shift OT (peut différer du need.start_time si
   * l'employé a déjà un shift contractuel le même jour : on cale après son
   * dernier shift + 15 min de pause minimale).
   */
  effective_start_time: string;
  /** Heure de fin effective (= need.end_time, on ne tronque pas la fin). */
  effective_end_time: string;
  /** Durée nette en heures du shift OT (sur la fenêtre effective). */
  effective_slot_hours: number;
  /** Total prévu si Karim autorise ce créneau (current + effective_slot_hours). */
  would_be_total_hours: number;
  /** Heures supplémentaires effectives (max(0, would_be_total - weekly_hours_target)). */
  overtime_hours: number;
  /**
   * Multiplier minimum requis pour autoriser ce créneau, palier 1.25 / 1.5 / 2
   * (ou null si l'employé reste sous son contractuel — cas rare mais possible
   * si on est en uncovered pour cause d'overlap avec un draft phase 1, etc).
   */
  min_multiplier_required: 1.0 | 1.25 | 1.5 | 2.0 | null;
};

export type UncoveredSlotWithCandidates = {
  need_id: string;
  date: string;
  day_label: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  role: string | null;
  missing: number;
  candidates: OvertimeCandidate[];
};

/** Calcule le multiplier minimum pour couvrir un total `would_be_total` h
 *  vs un contrat `weekly`. Retourne null si pas de dépassement. */
function pickMinMultiplier(
  weekly: number,
  wouldBeTotal: number,
): 1.0 | 1.25 | 1.5 | 2.0 | null {
  if (wouldBeTotal <= weekly + 1e-6) return null;
  const ratio = wouldBeTotal / weekly;
  if (ratio <= 1.25 + 1e-6) return 1.25;
  if (ratio <= 1.5 + 1e-6) return 1.5;
  if (ratio <= 2.0 + 1e-6) return 2.0;
  // Dépassement > ×2 : on signale ×2 comme "tu peux essayer mais ça reste au-delà du palier max".
  return 2.0;
}

export async function proposeOvertimeCandidatesAction(args: {
  siteCode: string;
  weekISO: string;
  baseDrafts: SitePlanPreview["drafts"];
}): Promise<{ slots: UncoveredSlotWithCandidates[] } | { error: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const { siteCode, weekISO, baseDrafts } = args;

  const ctx = await loadSolverContext(siteCode, weekISO);
  if ("error" in ctx) return ctx;
  const {
    monday,
    needs,
    allEmployees,
    tierByEmp,
    existing,
    offs,
    unavail,
    blockedDates,
    specialDates,
    holidayStaffMultByDate,
    closedDates,
  } = ctx;

  // Pause min 15 min entre contractuel et OT — règle métier 2026-05-11.
  const supabase = await createClient();
  const { data: orgRow } = await supabase
    .from("org_settings")
    .select("overtime_min_pause_minutes")
    .eq("id", 1)
    .maybeSingle();
  const otMinPause =
    (orgRow as { overtime_min_pause_minutes?: number | null } | null)
      ?.overtime_min_pause_minutes ?? 15;

  // Compteurs initialisés depuis l'EXISTANT (toutes affectations confondues).
  const plannedHours = new Map<string, number>();
  for (const e of allEmployees) plannedHours.set(e.id, 0);
  for (const s of existing) {
    plannedHours.set(
      s.employee_id,
      (plannedHours.get(s.employee_id) ?? 0) +
        netShiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
    );
  }
  // Ajoute les baseDrafts (phase 1) — point de départ de l'analyse OT.
  for (const d of baseDrafts) {
    plannedHours.set(
      d.employee_id,
      (plannedHours.get(d.employee_id) ?? 0) +
        slotHours(d.start_time, d.end_time),
    );
  }

  // Index des fins de shift contractuel par (empId, dateISO) pour calculer
  // l'heure mini du shift OT (= dernier end + pause).
  const lastEndByDay = new Map<string, number>();
  function noteEnd(empId: string, dateISO: string, end: string) {
    const key = `${empId}|${dateISO}`;
    const cur = lastEndByDay.get(key) ?? -1;
    const m = timeToMin(end);
    if (m > cur) lastEndByDay.set(key, m);
  }
  for (const s of existing) noteEnd(s.employee_id, s.date, s.end_time);
  for (const d of baseDrafts) noteEnd(d.employee_id, d.date, d.end_time);

  // Liste des shifts à considérer pour les conflits.
  const allShiftsForConflict: Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }> = [
    ...existing.map((s) => ({
      employee_id: s.employee_id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
    })),
    ...baseDrafts.map((d) => ({
      employee_id: d.employee_id,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  ];

  const slots: UncoveredSlotWithCandidates[] = [];

  // Regle fondamentale Karim 2026-05-13 : ne propose pas d'OT < J+1.
  const tomorrowISOphase2b = toISODate(addDays(new Date(), 1));

  for (let dow = 0; dow < 7; dow++) {
    const dayDate = (() => {
      const offset = dow === 0 ? 6 : dow - 1;
      return addDays(monday, offset);
    })();
    const dateISO = toISODate(dayDate);
    const dayJsDow = dayDate.getDay();

    if (dateISO < tomorrowISOphase2b) continue;
    if (blockedDates.has(dateISO) || closedDates.has(dateISO)) continue;

    const dayNeeds = needs
      .filter((n) => n.day_of_week === dayJsDow)
      .sort(
        (a, b) =>
          slotHours(b.start_time, b.end_time) - slotHours(a.start_time, a.end_time),
      );

    for (const need of dayNeeds) {
      const need_s = need.start_time.slice(0, 5);
      const need_e = need.end_time.slice(0, 5);
      const need_eMin = timeToMin(need_e);
      const slotH = slotHours(need_s, need_e);

      // Combien de baseDrafts couvrent déjà ce besoin ?
      const alreadyCovered = baseDrafts.filter(
        (d) => d.date === dateISO && d.need_id === need.id,
      ).length;
      const remainingBase = need.headcount - alreadyCovered;
      if (remainingBase <= 0) continue;

      // OT méritocratique (décision Karim 2026-05-11) : on ne propose que
      // les employés "ot_eligible" — volontaires, autonomes, ayant déjà
      // démontré la capacité d'absorber des heures supp. Les autres ne sont
      // jamais sollicités, par construction.
      const otEligibleEmployees = allEmployees.filter((e) => e.ot_eligible === true);

      // Construit la liste de TOUS les candidats (dispo ou non) pour donner
      // la transparence complète à Karim. Trié par tier puis heures restantes.
      const candidates: OvertimeCandidate[] = [];
      for (const e of otEligibleEmployees) {
        const tier = (tierByEmp.get(e.id) ?? 3) as 1 | 2 | 3;
        const current = plannedHours.get(e.id) ?? 0;
        const weekly = e.weekly_hours ?? 38;

        // Détermine la dispo : off/congé > unavail > conflit > effective slot.
        let reason: string | undefined;
        let available = true;

        if (isOffOrLeave(e, dateISO, dayJsDow, offs, specialDates)) {
          // Discrimine off-day vs leave (congé approuvé) pour l'UI.
          const isoDow = dayJsDow === 0 ? 6 : dayJsDow - 1;
          if ((e.fixed_off_days ?? []).includes(isoDow)) reason = "off_day";
          else reason = "in_leave";
          available = false;
        } else if (
          hasUnavailabilityOverlap(e.id, dateISO, dayJsDow, need_s, need_e, unavail)
        ) {
          reason = "in_unavail";
          available = false;
        }

        // Détermine l'heure de début effective (cale après contractuel + pause).
        const lastEnd = lastEndByDay.get(`${e.id}|${dateISO}`) ?? -1;
        let effStartMin = timeToMin(need_s);
        if (lastEnd >= 0) {
          const minStart = lastEnd + otMinPause;
          if (minStart > effStartMin) effStartMin = minStart;
        }
        // Si la fenêtre devient trop courte (<15 min utiles), inéligible.
        if (available && effStartMin >= need_eMin - 15) {
          reason = "conflict";
          available = false;
        }

        const effStart = minToHHMM(effStartMin);
        const effEnd = need_e;
        const effSlotH = available ? (need_eMin - effStartMin) / 60 : slotH;

        // Conflit avec un autre shift sur la fenêtre effective ?
        if (
          available &&
          hasConflict(e.id, dateISO, effStart, effEnd, allShiftsForConflict)
        ) {
          reason = "conflict";
          available = false;
        }

        const wouldBeTotal = current + (available ? effSlotH : slotH);
        const overtime = Math.max(0, wouldBeTotal - weekly);
        const minMult = pickMinMultiplier(weekly, wouldBeTotal);

        candidates.push({
          employee_id: e.id,
          employee_name: e.full_name,
          current_planned_hours: current,
          weekly_hours_target: weekly,
          available_for_this_slot: available,
          reason_unavailable: reason,
          pool_tier: tier,
          effective_start_time: effStart,
          effective_end_time: effEnd,
          effective_slot_hours: effSlotH,
          would_be_total_hours: wouldBeTotal,
          overtime_hours: overtime,
          min_multiplier_required: minMult,
        });
      }

      // Tri : dispo d'abord, puis tier ASC (primary > secondary > external),
      // puis moins d'heures actuelles (donner à qui en a le moins =
      // minimiser le dépassement nécessaire).
      candidates.sort((a, b) => {
        if (a.available_for_this_slot !== b.available_for_this_slot) {
          return a.available_for_this_slot ? -1 : 1;
        }
        if (a.pool_tier !== b.pool_tier) return a.pool_tier - b.pool_tier;
        return a.current_planned_hours - b.current_planned_hours;
      });

      slots.push({
        need_id: need.id,
        date: dateISO,
        day_label: DAYS_FR[dayJsDow],
        start_time: need_s,
        end_time: need_e,
        duration_hours: slotH,
        role: need.role,
        missing: remainingBase,
        candidates,
      });
    }
  }

  return { slots };
}

// --- commit case-par-case --------------------------------------------------

const ALLOWED_MULTIPLIERS_SET = new Set<number>([1.0, 1.25, 1.5, 2.0]);

export async function commitIndividualOvertimeAction(args: {
  siteCode: string;
  weekISO: string;
  authorizations: Array<{
    need_id: string;
    employee_id: string;
    start_time: string;
    end_time: string;
    overtime_multiplier: number;
    note?: string;
  }>;
}): Promise<{ ok?: boolean; error?: string; created?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const { siteCode, weekISO, authorizations } = args;

  if (!Array.isArray(authorizations) || authorizations.length === 0) {
    return { error: "Aucune autorisation à commit." };
  }
  for (const a of authorizations) {
    if (!ALLOWED_MULTIPLIERS_SET.has(a.overtime_multiplier)) {
      return {
        error: `Multiplicateur ${a.overtime_multiplier} non autorisé. Utilise 1.0, 1.25, 1.5 ou 2.0.`,
      };
    }
  }

  const ctx = await loadSolverContext(siteCode, weekISO);
  if ("error" in ctx) return ctx;
  const {
    siteId,
    needs,
    allEmployees,
    existing,
    offs,
    unavail,
    blockedDates,
    specialDates,
    holidayStaffMultByDate,
    closedDates,
  } = ctx;

  const supabase = await createClient();
  const { data: orgRow } = await supabase
    .from("org_settings")
    .select("overtime_min_pause_minutes")
    .eq("id", 1)
    .maybeSingle();
  const otMinPause =
    (orgRow as { overtime_min_pause_minutes?: number | null } | null)
      ?.overtime_min_pause_minutes ?? 15;

  const empById = new Map(allEmployees.map((e) => [e.id, e]));
  const needById = new Map(needs.map((n) => [n.id, n]));

  // Heures contractuelles déjà planifiées sur la semaine, par employé.
  // Sert à refuser une autorisation OT tant que le quota hebdo contractuel
  // n'est pas saturé (sinon on tague à tort un shift comme "heure sup").
  const contractHoursByEmp = new Map<string, number>();
  for (const s of existing) {
    if (s.is_overtime) continue;
    const dur = (timeToMin(s.end_time) - timeToMin(s.start_time) - (s.break_minutes ?? 0)) / 60;
    contractHoursByEmp.set(
      s.employee_id,
      (contractHoursByEmp.get(s.employee_id) ?? 0) + dur,
    );
  }

  // Index dynamique des shifts existants (pour conflit + pause minimale). On
  // y ajoute les nouveaux drafts au fil de l'eau.
  const allShifts: Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }> = existing.map((s) => ({
    employee_id: s.employee_id,
    date: s.date,
    start_time: s.start_time,
    end_time: s.end_time,
  }));

  const lastEndByDay = new Map<string, number>();
  for (const s of existing) {
    const key = `${s.employee_id}|${s.date}`;
    const cur = lastEndByDay.get(key) ?? -1;
    const m = timeToMin(s.end_time);
    if (m > cur) lastEndByDay.set(key, m);
  }

  type Row = {
    employee_id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    position: string | null;
    location: string | null;
    status: "planned";
    created_by: string;
    is_overtime: boolean;
    overtime_multiplier: number;
    notes: string | null;
  };
  const rows: Row[] = [];
  const logs: Array<{
    employee_id: string;
    employee_name: string;
    date: string;
    multiplier: number;
    hours: number;
  }> = [];

  for (const auth of authorizations) {
    const need = needById.get(auth.need_id);
    if (!need) {
      return { error: `Besoin ${auth.need_id} introuvable (a-t-il été supprimé ?).` };
    }
    const emp = empById.get(auth.employee_id);
    if (!emp) {
      return { error: `Employé ${auth.employee_id} introuvable ou inactif.` };
    }

    // Recalcule la date depuis le besoin (day_of_week) + weekISO pour éviter
    // qu'un client malicieux pousse une date arbitraire.
    const monday = startOfWeek(parseISODate(weekISO));
    const offset = need.day_of_week === 0 ? 6 : need.day_of_week - 1;
    const dayDate = addDays(monday, offset);
    const dateISO = toISODate(dayDate);
    const dayJsDow = dayDate.getDay();

    // Regle fondamentale Karim 2026-05-13 : on ne cree pas d'OT < J+1.
    const tomorrowISOcommit = toISODate(addDays(new Date(), 1));
    if (dateISO < tomorrowISOcommit) {
      return {
        error: `Le ${dateISO} est passé ou aujourd'hui — autorisation OT impossible (planification à partir de J+1).`,
      };
    }
    if (blockedDates.has(dateISO) || closedDates.has(dateISO)) {
      return {
        error: `Le ${dateISO} est fermé/férié — autorisation impossible pour ${emp.full_name}.`,
      };
    }

    const need_s = need.start_time.slice(0, 5);
    const need_e = need.end_time.slice(0, 5);

    // Re-vérifie off / congé / indispo à l'instant T.
    if (isOffOrLeave(emp, dateISO, dayJsDow, offs, specialDates)) {
      return {
        error: `${emp.full_name} est off ou en congé le ${dateISO} — autorisation refusée.`,
      };
    }
    if (hasUnavailabilityOverlap(emp.id, dateISO, dayJsDow, need_s, need_e, unavail)) {
      return {
        error: `${emp.full_name} a déclaré une indispo qui chevauche ce créneau.`,
      };
    }

    // Recalcule le start effectif (= max(need_s, lastEnd + pause)).
    const lastEnd = lastEndByDay.get(`${emp.id}|${dateISO}`) ?? -1;
    let effStartMin = timeToMin(need_s);
    if (lastEnd >= 0) {
      const minStart = lastEnd + otMinPause;
      if (minStart > effStartMin) effStartMin = minStart;
    }
    const effEndMin = timeToMin(need_e);
    if (effStartMin >= effEndMin - 15) {
      return {
        error: `Pas assez de fenêtre disponible pour ${emp.full_name} le ${dateISO} (pause min ${otMinPause} min après son contractuel).`,
      };
    }
    const effStart = minToHHMM(effStartMin);
    const effEnd = need_e;

    // Honore le start_time fourni par le client uniquement s'il est >= au start
    // recalculé (le client peut décaler plus tard, jamais plus tôt).
    const clientStartMin = timeToMin(auth.start_time);
    const finalStart =
      clientStartMin > effStartMin ? auth.start_time : effStart;
    // Le end_time du client doit être <= need_e (on ne sort pas du créneau).
    const clientEndMin = timeToMin(auth.end_time);
    const finalEnd =
      clientEndMin > 0 && clientEndMin <= effEndMin ? auth.end_time : effEnd;

    if (timeToMin(finalEnd) - timeToMin(finalStart) < 15) {
      return {
        error: `Fenêtre trop courte pour ${emp.full_name} le ${dateISO}.`,
      };
    }

    if (hasConflict(emp.id, dateISO, finalStart, finalEnd, allShifts)) {
      return {
        error: `Conflit horaire détecté pour ${emp.full_name} le ${dateISO} ${finalStart}-${finalEnd}.`,
      };
    }

    const target = emp.weekly_hours ?? 38;
    const alreadyContract = contractHoursByEmp.get(emp.id) ?? 0;
    if (alreadyContract + 0.0001 < target) {
      const reste = (target - alreadyContract).toFixed(1);
      return {
        error: `${emp.full_name} n'a que ${alreadyContract.toFixed(1)}h contractuelles sur la semaine (cible ${target}h, reste ${reste}h). Ajoute d'abord les heures contractuelles manquantes — l'OT ne s'autorise qu'au-delà du quota hebdo.`,
      };
    }

    const hours = (timeToMin(finalEnd) - timeToMin(finalStart)) / 60;
    const actorLabel =
      profile.full_name?.trim() || profile.email || "manager";

    const noteText = `Heure sup. ×${auth.overtime_multiplier} autorisée par ${actorLabel}${auth.note ? ` — ${auth.note}` : ""}`;

    rows.push({
      employee_id: emp.id,
      site_id: siteId,
      date: dateISO,
      start_time: finalStart,
      end_time: finalEnd,
      break_minutes: emp.default_pause_minutes ?? 30,
      position: need.role,
      location: null,
      status: "planned",
      created_by: profile.id,
      is_overtime: true,
      overtime_multiplier: auth.overtime_multiplier,
      notes: noteText,
    });

    logs.push({
      employee_id: emp.id,
      employee_name: emp.full_name,
      date: dateISO,
      multiplier: auth.overtime_multiplier,
      hours,
    });

    // Mets à jour les index dynamiques pour valider les autorisations
    // suivantes contre celles déjà acceptées dans ce même commit.
    allShifts.push({
      employee_id: emp.id,
      date: dateISO,
      start_time: finalStart,
      end_time: finalEnd,
    });
    const key = `${emp.id}|${dateISO}`;
    const curEnd = lastEndByDay.get(key) ?? -1;
    if (timeToMin(finalEnd) > curEnd) lastEndByDay.set(key, timeToMin(finalEnd));
  }

  if (rows.length === 0) return { error: "Aucune ligne à insérer." };

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { error: error.message };

  // Activity log : un événement par shift OT créé (target = employé).
  const actorLabel = profile.full_name?.trim() || profile.email || "manager";
  await Promise.all(
    logs.map((l) =>
      logActivity({
        kind: "shift.overtime_created",
        targetType: "employee",
        targetId: l.employee_id,
        description: `Heure sup. ×${l.multiplier} autorisée pour ${l.employee_name} le ${l.date}`,
        data: {
          site: siteCode,
          week: weekISO,
          multiplier: l.multiplier,
          hours: l.hours,
          authorized_by: actorLabel,
        },
        actorId: profile.id,
        actorLabel,
      }),
    ),
  );

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: rows.length };
}
