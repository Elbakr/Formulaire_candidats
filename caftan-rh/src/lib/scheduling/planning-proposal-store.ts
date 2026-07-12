// planning-proposal-store.ts — orchestration DB (server-only) de la proposition
// de planning. Utilisé PAR LES DEUX déclencheurs : le trigger de signature et le
// bouton « Générer » de la fiche. Charge l'employé + ses indispos + les réglages
// de pause vendredi, appelle le moteur pur, puis UPSERT la proposition COURANTE
// (une seule par employé : contrainte unique employee_id).
//
// AUCUN envoi au travailleur ici (la notif admin est faite par l'appelant).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePlanningProposal,
  DEFAULT_PROPOSAL_PRAYER_PAUSE,
  type PlanningProposal,
  type ProposalPrayerPause,
  type ProposalUnavailability,
} from "@/lib/scheduling/planning-proposal";

/** Pattern abstrait d'un modèle de planning (planning_templates.pattern). */
export type PlanningTemplatePattern = {
  start_offset: number; // 0 = variante A (consécutif), 1 = variante B, ...
  /** Variante d'origine du modèle ('A' | 'B' | 'C'). Optionnel (rétro-compat). */
  variant?: "A" | "B" | "C";
  /** true = modèle « réparti sur la semaine » (variante C, ignore start_offset). */
  spread?: boolean;
  default_start_time: string; // "HH:MM"
  default_shift_hours: number;
  weekly_hours: number;
  weeks: number;
};

type EmpRow = {
  id: string;
  full_name: string | null;
  weekly_hours: number | null;
  default_start_time: string | null;
  default_shift_hours: number | null;
  default_pause_minutes: number | null;
  fixed_off_days: number[] | null;
  contract_type: string | null;
  start_date: string | null;
};

// Magasins « Brabant » (rue de Brabant, Schaerbeek) — non-chevauchement des pauses
// exigé. Sous-ensemble de Bruxelles (A,B,D,E) : E = Molenbeek en est EXCLU.
// (cf. src/lib/city.ts : Bruxelles = A,B,D,E ; Anvers = C,F.)
const BRABANT_SITE_CODES = new Set(["A", "B", "D"]);

/**
 * Résout le site PRINCIPAL d'un travailleur (site_assignments.is_primary, actif)
 * + la liste des travailleurs de CE magasin (pour l'échelonnement Brabant). En
 * l'absence d'assignation, renvoie non-Brabant (aucune contrainte).
 *
 * `staggerRank` = rang déterministe du travailleur parmi les présents du magasin
 * (tri par employee_id), pour décaler ses fenêtres de pause. Source « autres
 * pauses » = LISTE DES TRAVAILLEURS du site : la table `shifts` NE STOCKE PAS les
 * pauses (aucune colonne break), donc on ne peut pas lire les fenêtres réelles ->
 * fallback déterministe par rang (cf. moteur). Limite signalée dans `reason`.
 */
async function resolveSiteStagger(
  admin: SupabaseClient,
  employeeId: string,
): Promise<{
  brabant: boolean;
  staggerRank: number;
  siteCode: string | null;
  siteId: string | null;
}> {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
    const { data: aRaw } = await admin
      .from("site_assignments")
      .select("site_id, is_primary, start_date, end_date, site:sites(code)")
      .eq("employee_id", employeeId)
      .order("is_primary", { ascending: false })
      .order("start_date", { ascending: false });
    const assigns = ((aRaw ?? []) as unknown) as Array<{
      site_id: string;
      is_primary: boolean | null;
      end_date: string | null;
      site: { code: string } | null;
    }>;
    const active = assigns.filter((a) => !a.end_date || a.end_date >= today);
    const primary = active.find((a) => a.is_primary) ?? active[0] ?? null;
    if (!primary) return { brabant: false, staggerRank: 0, siteCode: null, siteId: null };
    const siteCode = primary.site?.code ?? null;
    const siteId = primary.site_id ?? null;
    if (!siteCode || !BRABANT_SITE_CODES.has(siteCode)) {
      return { brabant: false, staggerRank: 0, siteCode, siteId };
    }

    // Rang déterministe parmi les travailleurs affectés (primaire, actif) à ce site.
    const { data: matesRaw } = await admin
      .from("site_assignments")
      .select("employee_id, end_date")
      .eq("site_id", primary.site_id)
      .eq("is_primary", true);
    const mates = ((matesRaw ?? []) as Array<{ employee_id: string; end_date: string | null }>)
      .filter((m) => !m.end_date || m.end_date >= today)
      .map((m) => m.employee_id);
    const uniqueSorted = Array.from(new Set(mates)).sort();
    const idx = uniqueSorted.indexOf(employeeId);
    return { brabant: true, staggerRank: idx >= 0 ? idx : 0, siteCode, siteId };
  } catch {
    return { brabant: false, staggerRank: 0, siteCode: null, siteId: null };
  }
}

// ── Heures de fermeture DÉRIVÉES de `site_needs` (Karim 2026-07-10, v2) ───────
// L'heure de fermeture d'un site pour un JOUR DE SEMAINE = le MAX des `end_time`
// des créneaux d'effectif (`site_needs`) de ce site ce jour-là, PLAFONNÉ à 20:00.
// Convention `site_needs.day_of_week` = 0=Dim..6=Sam (JS getDay) — IDENTIQUE à
// celle du moteur (`jsDowOf`), donc AUCUNE conversion : la clé de la map = dow tel
// quel. On ne remplit que les jours qui ont au moins une ligne `site_needs` active ;
// les jours absents ne sont PAS mis dans la map -> le moteur retombe alors sur la
// règle en dur (`siteClosingTime`) pour ce jour. Best-effort : en cas d'échec DB,
// map vide -> fallback total sur la règle en dur.
const CLOSING_CAP_MIN = 20 * 60; // plafond absolu 20:00.

function timeToMinLocal(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function loadSiteClosings(
  admin: SupabaseClient,
  siteId: string | null,
): Promise<Record<number, string>> {
  if (!siteId) return {};
  try {
    const { data, error } = await admin
      .from("site_needs")
      .select("day_of_week, end_time")
      .eq("site_id", siteId)
      .eq("is_enabled", true);
    if (error || !data) return {};
    const rows = data as Array<{ day_of_week: number | null; end_time: string | null }>;
    // Max end_time par jour de semaine (en minutes), puis plafonné à 20:00.
    const maxByDow = new Map<number, number>();
    for (const r of rows) {
      if (r.day_of_week == null || r.day_of_week < 0 || r.day_of_week > 6) continue;
      if (!r.end_time) continue;
      const min = timeToMinLocal(r.end_time);
      const cur = maxByDow.get(r.day_of_week);
      if (cur == null || min > cur) maxByDow.set(r.day_of_week, min);
    }
    const out: Record<number, string> = {};
    for (const [dow, min] of maxByDow) {
      out[dow] = minToHHMM(Math.min(CLOSING_CAP_MIN, min));
    }
    return out;
  } catch {
    return {};
  }
}

async function loadPrayerPause(admin: SupabaseClient): Promise<ProposalPrayerPause> {
  try {
    const { data } = await admin
      .from("org_settings")
      .select(
        "prayer_pause_enabled, prayer_pause_summer, prayer_pause_winter, prayer_pause_dst_start, prayer_pause_dst_end",
      )
      .eq("id", 1)
      .maybeSingle();
    const s = data as {
      prayer_pause_enabled: boolean | null;
      prayer_pause_summer: string | null;
      prayer_pause_winter: string | null;
      prayer_pause_dst_start: string | null;
      prayer_pause_dst_end: string | null;
    } | null;
    return {
      enabled: s?.prayer_pause_enabled ?? DEFAULT_PROPOSAL_PRAYER_PAUSE.enabled,
      summer: s?.prayer_pause_summer ?? DEFAULT_PROPOSAL_PRAYER_PAUSE.summer,
      winter: s?.prayer_pause_winter ?? DEFAULT_PROPOSAL_PRAYER_PAUSE.winter,
      dstStart: s?.prayer_pause_dst_start ?? DEFAULT_PROPOSAL_PRAYER_PAUSE.dstStart,
      dstEnd: s?.prayer_pause_dst_end ?? DEFAULT_PROPOSAL_PRAYER_PAUSE.dstEnd,
    };
  } catch {
    return DEFAULT_PROPOSAL_PRAYER_PAUSE;
  }
}

/**
 * (Re)génère la proposition COURANTE d'un employé et l'UPSERT (écrase l'ancienne).
 * Best-effort : ne lève jamais (retourne { ok:false, reason } en cas d'échec) —
 * l'appelant (signature) ne doit JAMAIS être bloqué par cette génération.
 *
 * @param startDate  "YYYY-MM-DD" — début de l'horizon (ex. lendemain de signature).
 * @param generatedBy  'signature' | 'manual:<profileId>' | ...
 * @param template   optionnel : applique un pattern de modèle enregistré
 *                   (override heure/durée/heures + répartition), tout en
 *                   RE-VÉRIFIANT dispos/off/indispo/pause vendredi du travailleur.
 */
/** Lundi de la semaine d'une date ISO "YYYY-MM-DD" (semaine lun→dim). */
function mondayOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = dt.getUTCDay(); // 0=Dim..6=Sam
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7)); // recule jusqu'au lundi
  return dt.toISOString().slice(0, 10);
}

export async function regeneratePlanningProposal(
  admin: SupabaseClient,
  employeeId: string,
  opts: {
    startDate: string;
    generatedBy: string;
    scheduleRecurrence?: string | null;
    template?: PlanningTemplatePattern | null;
  },
): Promise<{ ok: boolean; proposal?: PlanningProposal; employeeName?: string; reason?: string }> {
  try {
    const { data: empRaw } = await admin
      .from("employees")
      .select("id, full_name, weekly_hours, default_start_time, default_shift_hours, default_pause_minutes, fixed_off_days, contract_type, start_date")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRaw as EmpRow | null;
    if (!emp) return { ok: false, reason: "employé introuvable" };

    // Karim 2026-07-10 (BUG) : `employee_unavailabilities` N'A PAS de colonne
    // `date_end` -> l'ancien select la demandait, la requête échouait (400) et les
    // indispos étaient SILENCIEUSEMENT ignorées à la génération. On ne sélectionne
    // que les colonnes réelles ; une indispo ponctuelle = une seule date
    // (`date_specific`), date_end=null.
    const { data: unavailRaw, error: unavailErr } = await admin
      .from("employee_unavailabilities")
      .select("day_of_week, date_specific, start_time, end_time, is_active")
      .eq("employee_id", employeeId)
      .eq("is_active", true);
    if (unavailErr) {
      console.warn("[planning-proposal] chargement indispos KO:", unavailErr.message);
    }
    const unavailabilities = ((unavailRaw ?? []) as Array<{
      day_of_week: number | null;
      date_specific: string | null;
      start_time: string | null;
      end_time: string | null;
    }>).map<ProposalUnavailability>((u) => ({
      day_of_week: u.day_of_week,
      date_specific: u.date_specific,
      date_end: null,
      start_time: u.start_time,
      end_time: u.end_time,
    }));

    const prayerPause = await loadPrayerPause(admin);

    // Pause quotidienne du travailleur (fiche), fractionnée en 2 par le moteur et
    // EXCLUE des heures (shift allongé). Site principal Brabant -> échelonnement.
    const pauseMinutes = emp.default_pause_minutes ?? 30;
    const { brabant, staggerRank, siteCode, siteId } = await resolveSiteStagger(admin, employeeId);

    // Fermetures DÉRIVÉES de `site_needs` (max end_time/jour, plafond 20:00) pour le
    // site principal. Jours sans donnée -> fallback règle en dur côté moteur.
    const siteClosings = await loadSiteClosings(admin, siteId);

    // Modèle appliqué : on override heure/durée/heures cibles + répartition, mais
    // le moteur RE-VÉRIFIE off/indispo/pause vendredi pour CE travailleur et CETTE
    // date de début (les dates concrètes ne viennent jamais du modèle).
    const t = opts.template ?? null;

    // Karim 2026-07-12 : PLANCHER de date. Le 1er jour proposé ne peut JAMAIS être
    // antérieur à (a) la date SÉLECTIONNÉE à la génération, ni (b) le DÉBUT DE
    // CONTRAT s'il est renseigné. La semaine est calée au lundi pour l'alignement,
    // mais aucun jour AVANT ce plancher n'est proposé (semaine 0 tronquée si besoin).
    const selectedDay = opts.startDate.slice(0, 10);
    const contractStart = emp.start_date ? emp.start_date.slice(0, 10) : null;
    const notBeforeDate = contractStart && contractStart > selectedDay ? contractStart : selectedDay;

    const proposal = generatePlanningProposal({
      // Karim 2026-07-12 : la semaine 0 est calée sur le lundi DU PLANCHER (pas de la
      // date sélectionnée), pour que ce plancher tombe dans la semaine 0 et n'y vide
      // pas les shifts (sinon la proposition serait vide quand le contrat démarre plus
      // tard). Le plancher tronque ensuite les jours antérieurs de cette semaine.
      weeklyHours: t?.weekly_hours ?? emp.weekly_hours,
      defaultStartTime: t?.default_start_time ?? emp.default_start_time,
      defaultShiftHours: t?.default_shift_hours ?? emp.default_shift_hours,
      unavailabilities,
      // Karim 2026-07-11 : les semaines commencent TOUJOURS un LUNDI. Calé sur le
      // lundi du PLANCHER (max date sélectionnée / début de contrat).
      startDate: mondayOfISO(notBeforeDate),
      fixedOffDays: emp.fixed_off_days,
      weeks: t?.weeks ?? 3,
      prayerPause,
      variantAOffset: t ? t.start_offset : 0,
      variantBOffset: t ? t.start_offset + 1 : 1,
      pauseMinutes,
      brabant,
      staggerRank,
      // Plafond de fermeture : la fin des shifts ne dépasse jamais l'heure de
      // fermeture du site principal. Source = `site_needs` (max end_time/jour,
      // plafond 20:00) via `siteClosings` ; `siteCode` sert de FALLBACK (règle en
      // dur) pour les jours sans donnée `site_needs`.
      siteCode,
      siteClosings,
      // Conformité : étudiant -> mini-shifts autorisés + exempté du min 13 h/sem.
      isStudent: /tudiant/i.test(emp.contract_type ?? ""),
      // Aucun jour proposé avant la date sélectionnée ni avant le début de contrat.
      notBeforeDate,
    });

    // Échelonnement Brabant : la table `shifts` ne stocke pas les fenêtres de
    // pause réelles -> on utilise un décalage DÉTERMINISTE par rang. On le signale
    // (l'admin peut ajuster manuellement si un chevauchement subsiste).
    if (brabant && pauseMinutes > 0) {
      const note =
        "Magasin Brabant : pauses échelonnées par rang (décalage déterministe, les pauses réelles ne sont pas encore stockées) — vérifie la couverture si besoin.";
      proposal.reason = proposal.reason ? `${proposal.reason} ${note}` : note;
    }

    // Karim 2026-07-11 : à la (re)génération, CONSERVER la variante par défaut déjà
    // choisie (celle affichée sur la tablette) si sa lettre existe encore dans la
    // nouvelle proposition. On ne réinitialise à null que si elle a disparu.
    const { data: existingSel } = await admin
      .from("planning_proposals")
      .select("selected_variant")
      .eq("employee_id", employeeId)
      .maybeSingle();
    const prevSel = (existingSel as { selected_variant: string | null } | null)?.selected_variant ?? null;
    const availableLabels = new Set(
      [proposal.variant_a, proposal.variant_b, proposal.variant_c, ...proposal.variants_extra].map(
        (v) => v.label,
      ),
    );
    const keptSel = prevSel && availableLabels.has(prevSel) ? prevSel : null;

    // UPSERT « une seule proposition courante par employé » (unique employee_id).
    const { error } = await admin
      .from("planning_proposals")
      .upsert(
        {
          employee_id: employeeId,
          start_date: proposal.start_date,
          weeks: proposal.weeks,
          variant_a: proposal.variant_a,
          variant_b: proposal.variant_b,
          variant_c: proposal.variant_c,
          variants_extra: proposal.variants_extra,
          selected_variant: keptSel,
          status: "draft",
          schedule_recurrence: opts.scheduleRecurrence ?? null,
          reason: proposal.reason,
          generated_at: new Date().toISOString(),
          generated_by: opts.generatedBy,
        },
        { onConflict: "employee_id" },
      );
    if (error) return { ok: false, reason: error.message };

    return { ok: true, proposal, employeeName: emp.full_name ?? undefined };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

// ── Batch GLOBAL : (re)génère la proposition de TOUS les employés actifs ──────
// Karim 2026-07-11 : la « génération programmée » (Phase 2) s'exécute pour TOUS
// les employés SIMULTANÉMENT (pas fiche par fiche). Déclenché par le cron
// hebdomadaire ET par le bouton admin « Générer pour tous ». Réutilise le moteur
// conforme (100 % quota, séquentiel, shift 3 h, min 13 h, pause vendredi) et
// CONSERVE la variante par défaut déjà choisie. AUCUN envoi au travailleur.
export type BatchGenerateSummary = {
  total: number;
  ok: number;
  failed: Array<{ id: string; name: string; reason: string }>;
  alerts: Array<{ id: string; name: string; reason: string }>; // proposition avec `reason` (quota/conformité)
};

export async function regenerateAllPlanningProposals(
  admin: SupabaseClient,
  opts: { startDate: string; generatedBy: string; scheduleRecurrence?: string | null },
): Promise<BatchGenerateSummary> {
  const { data: rows } = await admin
    .from("employees")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name", { ascending: true });
  const employees = (rows ?? []) as Array<{ id: string; full_name: string | null }>;

  const summary: BatchGenerateSummary = { total: employees.length, ok: 0, failed: [], alerts: [] };
  const CONCURRENCY = 4; // limite pour ne pas saturer la DB / le temps d'exécution cron

  // Karim 2026-07-12 : le batch GLOBAL part TOUJOURS du LUNDI de la semaine (semaines
  // pleines), peu importe le jour où il est déclenché. Sinon un déclenchement en
  // milieu/fin de semaine tronque la semaine 0 (plancher = today) et fait remonter de
  // fausses alertes « sous-quota » pour tout le monde. Le début de contrat reste
  // respecté par employé (plancher `max(lundi, start_date)` dans regenerate...).
  const batchStart = mondayOfISO(opts.startDate);

  for (let i = 0; i < employees.length; i += CONCURRENCY) {
    const chunk = employees.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (emp) => {
        const name = emp.full_name ?? emp.id;
        try {
          const res = await regeneratePlanningProposal(admin, emp.id, {
            startDate: batchStart,
            generatedBy: opts.generatedBy,
            scheduleRecurrence: opts.scheduleRecurrence ?? "weekly",
          });
          return { emp, name, res };
        } catch (e) {
          return { emp, name, res: { ok: false, reason: (e as Error).message } as const };
        }
      }),
    );
    for (const { emp, name, res } of results) {
      if (!res.ok) {
        summary.failed.push({ id: emp.id, name, reason: res.reason ?? "erreur inconnue" });
      } else {
        summary.ok += 1;
        if (res.proposal?.reason) {
          summary.alerts.push({ id: emp.id, name, reason: res.proposal.reason });
        }
      }
    }
  }

  return summary;
}
