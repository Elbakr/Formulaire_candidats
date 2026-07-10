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

export type TabletBreak = { start: string; end: string };
export type TabletShift = {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  pause?: { start: string; end: string } | null;
  breaks?: TabletBreak[];
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
    .select("id, full_name")
    .eq("planning_access_code", code)
    .maybeSingle();
  const emp = empRaw as { id: string; full_name: string | null } | null;
  if (!emp) return generic;

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

  // Défaut 'A' si rien n'a été coché (aligné sur la Phase 2). Si 'C' est
  // sélectionnée mais absente (proposition d'avant la migration variant_c), on
  // retombe sur A pour ne jamais afficher un planning vide.
  const sel = prop.selected_variant;
  let variant: "A" | "B" | "C" = sel === "B" ? "B" : sel === "C" ? "C" : "A";
  let chosen = (variant === "C" ? prop.variant_c : variant === "B" ? prop.variant_b : prop.variant_a) as
    | { weeks?: TabletWeek[]; total_hours?: number }
    | null;
  if (variant === "C" && !chosen) {
    variant = "A";
    chosen = prop.variant_a as { weeks?: TabletWeek[]; total_hours?: number } | null;
  }

  const weeks = (chosen?.weeks ?? []) as TabletWeek[];
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
    },
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
