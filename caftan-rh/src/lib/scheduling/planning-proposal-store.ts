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
): Promise<{ brabant: boolean; staggerRank: number; siteCode: string | null }> {
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
    if (!primary) return { brabant: false, staggerRank: 0, siteCode: null };
    const siteCode = primary.site?.code ?? null;
    if (!siteCode || !BRABANT_SITE_CODES.has(siteCode)) {
      return { brabant: false, staggerRank: 0, siteCode };
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
    return { brabant: true, staggerRank: idx >= 0 ? idx : 0, siteCode };
  } catch {
    return { brabant: false, staggerRank: 0, siteCode: null };
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
      .select("id, full_name, weekly_hours, default_start_time, default_shift_hours, default_pause_minutes, fixed_off_days")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRaw as EmpRow | null;
    if (!emp) return { ok: false, reason: "employé introuvable" };

    const { data: unavailRaw } = await admin
      .from("employee_unavailabilities")
      .select("day_of_week, date_specific, date_end, start_time, end_time, is_active")
      .eq("employee_id", employeeId)
      .eq("is_active", true);
    const unavailabilities = ((unavailRaw ?? []) as Array<{
      day_of_week: number | null;
      date_specific: string | null;
      date_end: string | null;
      start_time: string | null;
      end_time: string | null;
    }>).map<ProposalUnavailability>((u) => ({
      day_of_week: u.day_of_week,
      date_specific: u.date_specific,
      date_end: u.date_end,
      start_time: u.start_time,
      end_time: u.end_time,
    }));

    const prayerPause = await loadPrayerPause(admin);

    // Pause quotidienne du travailleur (fiche), fractionnée en 2 par le moteur et
    // EXCLUE des heures (shift allongé). Site principal Brabant -> échelonnement.
    const pauseMinutes = emp.default_pause_minutes ?? 30;
    const { brabant, staggerRank } = await resolveSiteStagger(admin, employeeId);

    // Modèle appliqué : on override heure/durée/heures cibles + répartition, mais
    // le moteur RE-VÉRIFIE off/indispo/pause vendredi pour CE travailleur et CETTE
    // date de début (les dates concrètes ne viennent jamais du modèle).
    const t = opts.template ?? null;
    const proposal = generatePlanningProposal({
      weeklyHours: t?.weekly_hours ?? emp.weekly_hours,
      defaultStartTime: t?.default_start_time ?? emp.default_start_time,
      defaultShiftHours: t?.default_shift_hours ?? emp.default_shift_hours,
      unavailabilities,
      startDate: opts.startDate,
      fixedOffDays: emp.fixed_off_days,
      weeks: t?.weeks ?? 3,
      prayerPause,
      variantAOffset: t ? t.start_offset : 0,
      variantBOffset: t ? t.start_offset + 1 : 1,
      pauseMinutes,
      brabant,
      staggerRank,
    });

    // Échelonnement Brabant : la table `shifts` ne stocke pas les fenêtres de
    // pause réelles -> on utilise un décalage DÉTERMINISTE par rang. On le signale
    // (l'admin peut ajuster manuellement si un chevauchement subsiste).
    if (brabant && pauseMinutes > 0) {
      const note =
        "Magasin Brabant : pauses échelonnées par rang (décalage déterministe, les pauses réelles ne sont pas encore stockées) — vérifie la couverture si besoin.";
      proposal.reason = proposal.reason ? `${proposal.reason} ${note}` : note;
    }

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
          selected_variant: null,
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
