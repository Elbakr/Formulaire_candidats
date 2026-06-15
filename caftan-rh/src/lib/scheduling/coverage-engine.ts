// Moteur de couverture de congé — lecture seule.
//
// Dit si une demande de congé laisse assez de personnel en tenant compte
// des disponibilités déclarées (remplaçants) qui peuvent combler le manque.
//
// Usage :
//   const result = await checkLeaveCoverage({
//     employeeId: "...",
//     startDate: "2026-07-01",
//     endDate: "2026-07-05",
//   });
//
// Tables lues :
//   - org_settings          (seuil leave_auto_max_pct_absents_per_site)
//   - site_assignments      (site primaire de l'employé + effectif actif)
//   - employees             (filtre status = 'active')
//   - time_off_requests     (approved + pending sur la fenêtre)
//   - site_needs            (heures d'ouverture du site au jour du pic)
//   - employee-availability (module contrat — remplaçants déclarés disponibles)

import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  type AvailableEmployee,
  getAvailableEmployeesForSlot,
} from "@/lib/scheduling/employee-availability";

// ---------------------------------------------------------------------------
// Types publics

export type LeaveCoverage = {
  /** true si la couverture est assurée même avec les absents */
  covered: boolean;
  /** Site primaire de l'employé (null si non renseigné) */
  site_id: string | null;
  /** Date du pic d'absentéisme sur la fenêtre (YYYY-MM-DD) */
  peak_date: string | null;
  /** % d'absents brut au pic (incluant la demande courante) */
  absent_pct_raw: number;
  /** Nombre de remplaçants disponibles déclarés pour le créneau du pic */
  substitutes_available: number;
  /** % d'absents nets après contribution des remplaçants */
  absent_pct_after_substitution: number;
  /** Seuil paramétré (org_settings.leave_auto_max_pct_absents_per_site, défaut 30) */
  threshold_pct: number;
  /** Liste des remplaçants disponibles au pic */
  substitutes: AvailableEmployee[];
  /** Phrase FR explicable pour affichage ou log */
  reason: string;
};

// ---------------------------------------------------------------------------
// Helpers internes (même logique que leave-auto-validation.ts)

const MS_PER_DAY = 86_400_000;

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** day_of_week compatible avec site_needs.day_of_week (0 = Dim, 6 = Sam). */
function dowUTC(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** Formate une date YYYY-MM-DD en DD/MM pour la phrase FR. */
function fmt(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ---------------------------------------------------------------------------
// Chargement du seuil depuis org_settings

async function loadThreshold(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("leave_auto_max_pct_absents_per_site")
    .eq("id", 1)
    .maybeSingle();
  const raw = (data as { leave_auto_max_pct_absents_per_site: number | null } | null)
    ?.leave_auto_max_pct_absents_per_site;
  return typeof raw === "number" ? raw : 30;
}

// ---------------------------------------------------------------------------
// Calcul du pic d'absentéisme (même logique que computeMaxAbsentsPct)
//
// Retourne :
//   siteId         — site primaire (null si absent)
//   maxPct         — % d'absents au pic (-1 si pas de site)
//   maxDate        — date du pic
//   total          — effectif total actif sur le site
//
// Hypothèse effectif : on compte tous les site_assignments actifs sur la
// fenêtre dont l'employee.status = 'active'. C'est cohérent avec
// leave-auto-validation.ts.

type PeakResult = {
  siteId: string | null;
  maxPct: number;
  maxDate: string | null;
  total: number | null;
};

async function computePeak(
  employeeId: string,
  startISO: string,
  endISO: string,
  excludeRequestId: string | undefined,
): Promise<PeakResult> {
  const supabase = await createClient();

  // --- 1. Site primaire de l'employé ---
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
  if (!primary) return { siteId: null, maxPct: -1, maxDate: null, total: null };
  const siteId = primary.site_id;

  // --- 2. Roster actif sur le site ---
  const { data: rosterRaw } = await supabase
    .from("site_assignments")
    .select("employee_id")
    .eq("site_id", siteId)
    .lte("start_date", endISO)
    .or(`end_date.is.null,end_date.gte.${startISO}`);

  const rosterIds = new Set(
    ((rosterRaw ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id),
  );
  if (rosterIds.size === 0) return { siteId, maxPct: -1, maxDate: null, total: null };

  const { data: activeRaw } = await supabase
    .from("employees")
    .select("id")
    .in("id", Array.from(rosterIds))
    .eq("status", "active");

  const activeIds = new Set(((activeRaw ?? []) as Array<{ id: string }>).map((e) => e.id));
  const total = activeIds.size;
  if (total === 0) return { siteId, maxPct: -1, maxDate: null, total: 0 };

  // --- 3. Congés approved + pending sur la fenêtre, employés du site ---
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

  // --- 4. Pic jour par jour ---
  let maxAbs = 0;
  let maxDate: string | null = null;
  const includeSelf = activeIds.has(employeeId) ? 1 : 0;

  for (const date of eachDayBetween(startISO, endISO)) {
    let count = 0;
    for (const o of offs) {
      if (date >= o.start_date && date <= o.end_date) count += 1;
    }
    const pct = ((count + includeSelf) / total) * 100;
    if (pct > maxAbs) {
      maxAbs = pct;
      maxDate = date;
    }
  }

  return { siteId, maxPct: maxAbs, maxDate, total };
}

// ---------------------------------------------------------------------------
// Récupération du créneau horaire d'ouverture du site pour une date donnée
//
// On lit site_needs pour le day_of_week correspondant. Si plusieurs créneaux
// existent on prend le plus large (start le plus tôt → end le plus tard).
// Si aucun need n'existe → fallback 09:00 / 18:00.
//
// Hypothèse heures par défaut : 09:00-18:00 quand site_needs est vide.

type OpeningSlot = { startTime: string; endTime: string };

async function getSiteOpeningSlot(
  siteId: string,
  dateISO: string,
): Promise<OpeningSlot> {
  const supabase = await createClient();
  const dow = dowUTC(dateISO);

  const { data } = await supabase
    .from("site_needs")
    .select("start_time, end_time")
    .eq("site_id", siteId)
    .eq("day_of_week", dow);

  const rows = (data ?? []) as Array<{ start_time: string; end_time: string }>;
  if (rows.length === 0) return { startTime: "09:00", endTime: "18:00" };

  // Prend le créneau le plus large : start le plus tôt, end le plus tard.
  const startTime = rows.map((r) => r.start_time).sort()[0] ?? "09:00";
  const endTime = rows.map((r) => r.end_time).sort().at(-1) ?? "18:00";
  // Normalise HH:MM:SS → HH:MM pour getAvailableEmployeesForSlot.
  return {
    startTime: startTime.slice(0, 5),
    endTime: endTime.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Fonction principale publique

/**
 * Vérifie si une demande de congé laisse suffisamment de personnel sur le
 * site primaire de l'employé, en comptabilisant les remplaçants disponibles.
 *
 * @param args.employeeId      UUID de l'employé demandeur
 * @param args.startDate       Début du congé (YYYY-MM-DD)
 * @param args.endDate         Fin du congé (YYYY-MM-DD)
 * @param args.excludeRequestId  ID de la demande à exclure du calcul (évite
 *                             le double-comptage si la demande est déjà en DB)
 */
export async function checkLeaveCoverage(args: {
  employeeId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}): Promise<LeaveCoverage> {
  const { employeeId, startDate, endDate, excludeRequestId } = args;

  // --- Seuil paramétré ---
  const threshold_pct = await loadThreshold();

  // --- Pic d'absentéisme ---
  const peak = await computePeak(employeeId, startDate, endDate, excludeRequestId);

  // Cas : pas de site primaire → couverture impossible à évaluer.
  if (peak.siteId === null || peak.maxPct < 0) {
    return {
      covered: false,
      site_id: null,
      peak_date: null,
      absent_pct_raw: 0,
      substitutes_available: 0,
      absent_pct_after_substitution: 0,
      threshold_pct,
      substitutes: [],
      reason:
        "Impossible de vérifier la couverture : l'employé n'a pas de site principal renseigné.",
    };
  }

  const absent_pct_raw = Math.round(peak.maxPct * 10) / 10;
  const peak_date = peak.maxDate;
  const siteId = peak.siteId;
  const total = peak.total ?? 0;

  // --- Remplaçants disponibles au pic ---
  let substitutes: AvailableEmployee[] = [];
  let openingSlot: OpeningSlot = { startTime: "09:00", endTime: "18:00" };

  if (peak_date !== null) {
    openingSlot = await getSiteOpeningSlot(siteId, peak_date);
    substitutes = await getAvailableEmployeesForSlot({
      siteId,
      date: peak_date,
      startTime: openingSlot.startTime,
      endTime: openingSlot.endTime,
    });
  }

  const substitutes_available = substitutes.length;

  // --- % net après substitution ---
  // Hypothèse : chaque remplaçant disponible compense 1 absent (ratio 1:1).
  // Si total = 0, on évite la division par zéro → couvert par défaut.
  const substitution_reduction =
    total > 0 ? (substitutes_available / total) * 100 : 0;
  const absent_pct_after_substitution = Math.max(
    0,
    Math.round((absent_pct_raw - substitution_reduction) * 10) / 10,
  );

  const covered = absent_pct_after_substitution <= threshold_pct;

  // --- Phrase FR explicable ---
  let reason: string;
  if (peak_date === null || absent_pct_raw === 0) {
    reason = `Aucune absence simultanée détectée sur la période → couvert (${threshold_pct}% max).`;
  } else if (substitutes_available === 0) {
    reason =
      `Pic de ${absent_pct_raw}% d'absents le ${fmt(peak_date)} sur le site ${siteId}, ` +
      `aucun remplaçant disponible déclaré → ${absent_pct_after_substitution}% net ` +
      (covered ? `≤` : `>`) +
      ` ${threshold_pct}% : ${covered ? "couvert" : "non couvert"}.`;
  } else {
    reason =
      `Pic de ${absent_pct_raw}% d'absents le ${fmt(peak_date)} sur le site ${siteId}, ` +
      `${substitutes_available} remplaçant${substitutes_available > 1 ? "s" : ""} disponible${substitutes_available > 1 ? "s" : ""} déclaré${substitutes_available > 1 ? "s" : ""} ` +
      `(créneau ${openingSlot.startTime}-${openingSlot.endTime}) → ${absent_pct_after_substitution}% net ` +
      (covered ? `≤` : `>`) +
      ` ${threshold_pct}% : ${covered ? "couvert" : "non couvert"}.`;
  }

  return {
    covered,
    site_id: siteId,
    peak_date,
    absent_pct_raw,
    substitutes_available,
    absent_pct_after_substitution,
    threshold_pct,
    substitutes,
    reason,
  };
}
