"use server";

// Karim 2026-07-09 (Phase 3) : résolution PUBLIQUE (sans auth) du planning par
// défaut d'un travailleur à partir de son CODE PERSONNEL, pour la tablette
// partagée du magasin. Service-role : la page /tablette n'a pas de session.
//
// Sécurité assumée : le code est une COMMODITÉ (tablette magasin), pas une auth
// forte. On limite l'énumération (petit délai + message générique) et on ne
// renvoie QUE le planning par défaut du travailleur dont on a le code (prénom +
// horaires), jamais les 2 variantes ni de données internes.

import { createAdminClient } from "@/lib/supabase/server";
import {
  BRUXELLES_SITE_CODES,
  ANVERS_SITE_CODES,
  ALL_SITE_CODES,
  siteCodesForCity,
  type City,
} from "@/lib/city";
import { siteClosingTime } from "@/lib/scheduling/site-hours";
import { isAutoShiftActiveFor } from "@/lib/auto-shift";

export type TabletBreak = { start: string; end: string };
export type TabletShift = {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  pause?: { start: string; end: string } | null;
  breaks?: TabletBreak[];
  /** Auto-Shift : shift d'AUJOURD'HUI (mis en avant sur la tablette). */
  is_today?: boolean;
  /** Auto-Shift : magasin du shift réel (nom lisible). */
  site?: string | null;
};
export type TabletWeek = {
  week_index: number;
  week_start: string;
  week_end: string;
  shifts: TabletShift[];
  total_hours: number;
};
export type TabletPlanning = {
  first_name: string;
  variant: "A" | "B" | "C";
  weeks: TabletWeek[];
  total_hours: number;
  // Karim 2026-07-10 : contexte "site du jour". `default_city` = ville déduite
  // des affectations du travailleur (pré-sélectionne la bonne langue/jeu de
  // sites) ; `site_today` = site déjà signalé aujourd'hui (null sinon).
  default_city: TabletCity;
  site_today: string | null;
  // Karim 2026-07-11 : mode d'affichage.
  //  'variant'      = variant coché par défaut ;
  //  'auto_shift'   = planning RÉEL (shifts publiés) ;
  //  'auto_variant' = variant A/B/C auto-choisi pour la situation du jour.
  mode: "variant" | "auto_shift" | "auto_variant";
  today: string; // date du jour (Europe/Brussels), pour le surlignage
};

// Ville tablette : 'bruxelles' | 'anvers' (jamais 'all' côté travailleur).
export type TabletCity = Exclude<City, "all">;

export type TabletSiteBoardEntry = {
  code: string;
  name: string; // nom du magasin (fallback = code)
  people: string[]; // prénoms des travailleurs ayant signalé ce site aujourd'hui
};

type ResolveResult =
  | { ok: true; planning: TabletPlanning }
  | { ok: false; kind: "invalid" | "empty"; message: string };

function firstNameOf(fullName: string | null): string {
  const n = (fullName ?? "").trim();
  if (!n) return "Bonjour";
  return n.split(/\s+/)[0];
}

/** Petit délai anti-énumération (temps de réponse ~constant, code trouvé ou non). */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function resolvePlanningByCodeAction(
  rawCode: string,
): Promise<ResolveResult> {
  await delay(350);

  const code = (rawCode ?? "").replace(/\D/g, "").trim();
  const generic = {
    ok: false as const,
    kind: "invalid" as const,
    message: "Code non reconnu. Vérifie ton code et réessaie.",
  };
  if (code.length < 4 || code.length > 8) return generic;

  const admin = createAdminClient();
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, auto_shift, auto_variant")
    .eq("planning_access_code", code)
    .maybeSingle();
  const emp = empRaw as {
    id: string;
    full_name: string | null;
    auto_shift: boolean | null;
    auto_variant: boolean | null;
  } | null;
  if (!emp) return generic;

  // Karim 2026-07-11 : mode AUTO-SHIFT (individuel ou global) -> planning RÉEL.
  if (await isAutoShiftActiveFor(admin, emp)) {
    return { ok: true, planning: await buildAutoShiftPlanning(admin, emp) };
  }

  const { data: propRaw } = await admin
    .from("planning_proposals")
    .select("variant_a, variant_b, variant_c, selected_variant")
    .eq("employee_id", emp.id)
    .maybeSingle();
  const prop = propRaw as
    | {
        variant_a: unknown;
        variant_b: unknown;
        variant_c: unknown;
        selected_variant: "A" | "B" | "C" | null;
      }
    | null;

  if (!prop) {
    return {
      ok: false,
      kind: "empty",
      message: "Aucun planning disponible pour l'instant.",
    };
  }

  const today = brusselsToday();
  const autoVariant = emp.auto_variant === true;

  // Karim 2026-07-11 : en AUTO-VARIANT, on choisit le variant qui répond le mieux
  // à la SITUATION DU JOUR (shift aujourd'hui > prochain shift le plus proche > A).
  // Sinon : variant coché par défaut ('A' si rien, retombe sur A si C absent).
  let variant: "A" | "B" | "C";
  if (autoVariant) {
    variant = pickVariantForToday(prop, today);
  } else {
    const sel = prop.selected_variant;
    variant = sel === "B" ? "B" : sel === "C" ? "C" : "A";
  }
  let chosen = (variant === "C" ? prop.variant_c : variant === "B" ? prop.variant_b : prop.variant_a) as
    | { weeks?: TabletWeek[]; total_hours?: number }
    | null;
  if (!chosen) {
    variant = "A";
    chosen = prop.variant_a as { weeks?: TabletWeek[]; total_hours?: number } | null;
  }

  const weeks = markToday((chosen?.weeks ?? []) as TabletWeek[], today);
  const totalHours =
    typeof chosen?.total_hours === "number"
      ? chosen.total_hours
      : weeks.reduce((s, w) => s + (w.total_hours ?? 0), 0);

  // Contexte "site du jour" : ville par défaut (déduite des affectations) +
  // site éventuellement déjà signalé aujourd'hui.
  const default_city = await resolveDefaultCity(admin, emp.id);
  const site_today = await readTodayDeclaredSite(admin, emp.id);

  return {
    ok: true,
    planning: {
      first_name: firstNameOf(emp.full_name),
      variant,
      weeks,
      total_hours: totalHours,
      default_city,
      site_today,
      mode: autoVariant ? "auto_variant" : "variant",
      today,
    },
  };
}

// ── AUTO-VARIANT : choix du variant qui colle le mieux à AUJOURD'HUI ──────────
type PropForPick = { variant_a: unknown; variant_b: unknown; variant_c: unknown };

function pickVariantForToday(prop: PropForPick, today: string): "A" | "B" | "C" {
  const entries: Array<{ label: "A" | "B" | "C"; v: { weeks?: TabletWeek[] } | null }> = [
    { label: "A", v: prop.variant_a as { weeks?: TabletWeek[] } | null },
    { label: "B", v: prop.variant_b as { weeks?: TabletWeek[] } | null },
    { label: "C", v: prop.variant_c as { weeks?: TabletWeek[] } | null },
  ].filter((e) => e.v) as Array<{ label: "A" | "B" | "C"; v: { weeks?: TabletWeek[] } }>;
  if (entries.length === 0) return "A";

  const hoursOn = (v: { weeks?: TabletWeek[] }, date: string): number => {
    let h = 0;
    for (const w of v.weeks ?? []) for (const s of w.shifts ?? []) if (s.date === date) h += s.hours ?? 0;
    return h;
  };
  const soonest = (v: { weeks?: TabletWeek[] }): string | null => {
    let best: string | null = null;
    for (const w of v.weeks ?? [])
      for (const s of w.shifts ?? [])
        if (s.date >= today && (best === null || s.date < best)) best = s.date;
    return best;
  };

  // 1) Variant(s) avec un shift AUJOURD'HUI -> le plus d'heures aujourd'hui, puis A>B>C.
  const withToday = entries
    .map((e) => ({ ...e, h: hoursOn(e.v, today) }))
    .filter((e) => e.h > 0.01);
  if (withToday.length) {
    withToday.sort((a, b) => b.h - a.h || a.label.localeCompare(b.label));
    return withToday[0].label;
  }

  // 2) Sinon : variant dont le PROCHAIN shift est le plus proche.
  const withSoon = entries
    .map((e) => ({ ...e, d: soonest(e.v) }))
    .filter((e): e is { label: "A" | "B" | "C"; v: { weeks?: TabletWeek[] }; d: string } => !!e.d);
  if (withSoon.length) {
    withSoon.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.label.localeCompare(b.label)));
    return withSoon[0].label;
  }

  // 3) Fallback : A.
  return entries[0].label;
}

/** Recopie les semaines en marquant le shift du jour (surlignage tablette). */
function markToday(weeks: TabletWeek[], today: string): TabletWeek[] {
  return (weeks ?? []).map((w) => ({
    ...w,
    shifts: (w.shifts ?? []).map((s) => ({ ...s, is_today: s.date === today })),
  }));
}

// ── AUTO-SHIFT : planning RÉEL (shifts publiés) sur 3 semaines ────────────────
// Karim 2026-07-11 : en mode Auto-Shift, la tablette montre le VRAI planning du
// travailleur (table `shifts`) à partir du lundi de la semaine en cours, sur 3
// semaines, avec le JOUR EN COURS mis en avant. Remplace l'affichage du variant.
function mondayOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay(); // 0=Dim..6=Sam
  const backToMonday = (dow + 6) % 7; // Lun=0
  const base = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  base.setUTCDate(base.getUTCDate() - backToMonday);
  return base.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function buildAutoShiftPlanning(
  admin: ReturnType<typeof createAdminClient>,
  emp: { id: string; full_name: string | null },
): Promise<TabletPlanning> {
  const today = brusselsToday();
  const weekStart = mondayOfISO(today);
  const horizonEnd = addDaysISO(weekStart, 20); // 3 semaines (21 jours)

  const { data: rows } = await admin
    .from("shifts")
    .select("date, start_time, end_time, break_minutes, site_id, location, status")
    .eq("employee_id", emp.id)
    .gte("date", weekStart)
    .lte("date", horizonEnd)
    .neq("status", "cancelled")
    .order("date")
    .order("start_time");
  const shiftRows = ((rows ?? []) as Array<{
    date: string;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number | null;
    site_id: string | null;
    location: string | null;
    status: string | null;
  }>);

  // Noms des sites (site_id -> nom lisible).
  const siteIds = Array.from(new Set(shiftRows.map((s) => s.site_id).filter((x): x is string => !!x)));
  const nameById = new Map<string, string>();
  if (siteIds.length) {
    const { data: sites } = await admin.from("sites").select("id, name, code").in("id", siteIds);
    for (const s of (sites ?? []) as Array<{ id: string; name: string | null; code: string | null }>) {
      nameById.set(s.id, (s.name ?? s.code ?? "").trim());
    }
  }

  const hhmm = (t: string | null): string => (t ? t.slice(0, 5) : "");
  const toMin = (t: string | null): number => {
    if (!t) return 0;
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // 3 semaines (buckets), même si vides, pour montrer l'horizon.
  const weeks: TabletWeek[] = [];
  for (let w = 0; w < 3; w++) {
    const ws = addDaysISO(weekStart, w * 7);
    const we = addDaysISO(ws, 6);
    const inWeek = shiftRows.filter((s) => s.date >= ws && s.date <= we);
    const shifts: TabletShift[] = inWeek.map((s) => {
      const worked = Math.max(0, toMin(s.end_time) - toMin(s.start_time) - (s.break_minutes ?? 0));
      return {
        date: s.date,
        start_time: hhmm(s.start_time),
        end_time: hhmm(s.end_time),
        hours: Number((worked / 60).toFixed(2)),
        is_today: s.date === today,
        site: s.site_id ? nameById.get(s.site_id) ?? s.location ?? null : s.location ?? null,
      };
    });
    weeks.push({
      week_index: w,
      week_start: ws,
      week_end: we,
      shifts,
      total_hours: Number(shifts.reduce((a, x) => a + x.hours, 0).toFixed(2)),
    });
  }

  const default_city = await resolveDefaultCity(admin, emp.id);
  const site_today = await readTodayDeclaredSite(admin, emp.id);

  return {
    first_name: firstNameOf(emp.full_name),
    variant: "A",
    weeks,
    total_hours: Number(weeks.reduce((a, w) => a + w.total_hours, 0).toFixed(2)),
    default_city,
    site_today,
    mode: "auto_shift",
    today,
  };
}

// ── SITE DU JOUR ─────────────────────────────────────────────────────────────
// Sur la tablette partagée, le travailleur signale à quel magasin il est affecté
// AUJOURD'HUI. Stocké dans `tablet_site_declarations` (table CENTRALE) -> toutes
// les tablettes de tous les magasins voient le même état, en temps réel.

/** Date civile du jour à Bruxelles ("YYYY-MM-DD"), stable quel que soit le TZ serveur. */
function brusselsToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

/** getDay() JS (0=Dim..6=Sam) d'une "YYYY-MM-DD", stable en UTC. */
function jsDowOfISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Ville d'un code de site (A,B,D,E -> bruxelles ; C,F -> anvers). null si inconnu. */
function cityOfSiteCode(code: string): TabletCity | null {
  const c = code.trim().toUpperCase();
  if ((BRUXELLES_SITE_CODES as readonly string[]).includes(c)) return "bruxelles";
  if ((ANVERS_SITE_CODES as readonly string[]).includes(c)) return "anvers";
  return null;
}

/** Ville par défaut d'un travailleur d'après son site PRINCIPAL actif. Fallback bruxelles. */
async function resolveDefaultCity(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
): Promise<TabletCity> {
  try {
    const today = brusselsToday();
    const { data } = await admin
      .from("site_assignments")
      .select("is_primary, end_date, site:sites(code)")
      .eq("employee_id", employeeId)
      .order("is_primary", { ascending: false })
      .order("start_date", { ascending: false });
    const rows = ((data ?? []) as unknown) as Array<{
      is_primary: boolean | null;
      end_date: string | null;
      site: { code: string } | null;
    }>;
    const active = rows.filter((r) => !r.end_date || r.end_date >= today);
    for (const r of active) {
      const city = r.site?.code ? cityOfSiteCode(r.site.code) : null;
      if (city) return city;
    }
  } catch {
    /* best-effort */
  }
  return "bruxelles";
}

/** Site déjà signalé par ce travailleur aujourd'hui (code) ou null. */
async function readTodayDeclaredSite(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("tablet_site_declarations")
      .select("site_code")
      .eq("employee_id", employeeId)
      .eq("work_date", brusselsToday())
      .maybeSingle();
    return (data as { site_code: string } | null)?.site_code ?? null;
  } catch {
    return null;
  }
}

/** Heure de fermeture "HH:MM" d'un site pour aujourd'hui : MAX des site_needs
 *  (plafond 20:00), fallback règle en dur (site-hours.ts). */
async function deriveClosingTime(
  admin: ReturnType<typeof createAdminClient>,
  siteCode: string,
  iso: string,
): Promise<string> {
  const code = siteCode.trim().toUpperCase();
  try {
    const { data: siteRow } = await admin
      .from("sites")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    const siteId = (siteRow as { id: string } | null)?.id ?? null;
    if (siteId) {
      const dow = jsDowOfISO(iso);
      const { data: needs } = await admin
        .from("site_needs")
        .select("end_time")
        .eq("site_id", siteId)
        .eq("day_of_week", dow)
        .eq("is_enabled", true);
      const ends = ((needs ?? []) as Array<{ end_time: string | null }>)
        .map((n) => n.end_time)
        .filter((x): x is string => !!x);
      if (ends.length) {
        const maxMin = Math.min(20 * 60, Math.max(...ends.map(timeToMin)));
        return minToHHMM(maxMin);
      }
    }
  } catch {
    /* fallback ci-dessous */
  }
  return siteClosingTime(code, iso);
}

type DeclareResult =
  | { ok: true; site_code: string; city: TabletCity; closing_time: string }
  | { ok: false; message: string };

/**
 * Le travailleur signale son site du jour depuis la tablette. Écrit (upsert) une
 * ligne CENTRALE (employee_id + work_date) -> synchrone sur toutes les tablettes.
 * Fixe l'heure de fin du jour = fermeture du site (dérivée).
 */
export async function declareSiteAction(
  rawCode: string,
  rawSite: string,
): Promise<DeclareResult> {
  await delay(200);
  const code = (rawCode ?? "").replace(/\D/g, "").trim();
  const site = (rawSite ?? "").trim().toUpperCase();

  if (!(ALL_SITE_CODES as readonly string[]).includes(site)) {
    return { ok: false, message: "Site inconnu." };
  }
  const city = cityOfSiteCode(site);
  if (!city) return { ok: false, message: "Site inconnu." };

  const admin = createAdminClient();
  const { data: empRaw } = await admin
    .from("employees")
    .select("id")
    .eq("planning_access_code", code)
    .maybeSingle();
  const emp = empRaw as { id: string } | null;
  if (!emp) return { ok: false, message: "Code non reconnu." };

  const work_date = brusselsToday();
  const closing_time = await deriveClosingTime(admin, site, work_date);

  const { error } = await admin.from("tablet_site_declarations").upsert(
    {
      employee_id: emp.id,
      work_date,
      site_code: site,
      city,
      closing_time,
      source: "tablet",
      declared_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,work_date" },
  );
  if (error) return { ok: false, message: "Enregistrement impossible, réessaie." };

  return { ok: true, site_code: site, city, closing_time };
}

/**
 * Tableau LIVE "qui est où aujourd'hui" pour une ville. Lu par toutes les
 * tablettes -> chacune voit l'affectation en temps réel (synchro). Renvoie tous
 * les sites de la ville (même vides) avec les prénoms déjà signalés.
 */
export async function getSiteBoardAction(city: TabletCity): Promise<TabletSiteBoardEntry[]> {
  const admin = createAdminClient();
  const codes = siteCodesForCity(city) as readonly string[];

  // Noms des magasins (code -> name), pour un libellé lisible.
  const { data: siteRows } = await admin.from("sites").select("code, name").in("code", [...codes]);
  const nameByCode = new Map<string, string>();
  for (const s of (siteRows ?? []) as Array<{ code: string; name: string | null }>) {
    nameByCode.set(s.code.toUpperCase(), (s.name ?? "").trim());
  }

  // Déclarations du jour pour cette ville.
  const { data: decls } = await admin
    .from("tablet_site_declarations")
    .select("site_code, employee:employees(full_name)")
    .eq("work_date", brusselsToday())
    .eq("city", city);
  const peopleByCode = new Map<string, string[]>();
  for (const d of (decls ?? []) as Array<{
    site_code: string;
    employee: { full_name: string | null } | null;
  }>) {
    const c = d.site_code.toUpperCase();
    const arr = peopleByCode.get(c) ?? [];
    arr.push(firstNameOf(d.employee?.full_name ?? null));
    peopleByCode.set(c, arr);
  }

  return codes.map((code) => ({
    code,
    name: nameByCode.get(code) || `Magasin ${code}`,
    people: (peopleByCode.get(code) ?? []).sort(),
  }));
}
