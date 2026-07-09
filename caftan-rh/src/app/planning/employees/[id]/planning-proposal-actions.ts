"use server";

// Karim 2026-07-09 : actions fiche employé pour la PROPOSITION DE PLANNING
// (Phase 1). (Re)génération manuelle 1-clic + enregistrement d'un MODÈLE
// réutilisable. AUCUN envoi au travailleur.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { notifyRoles } from "@/lib/notify";
import {
  regeneratePlanningProposal,
  type PlanningTemplatePattern,
} from "@/lib/scheduling/planning-proposal-store";

/**
 * (Re)génère la proposition COURANTE d'un employé (remplace l'existante).
 * `startDate` = date de début éditable (défaut côté UI = demain).
 * `templateId` optionnel : applique un modèle enregistré (mêmes heure/durée/
 * répartition), en RE-VÉRIFIANT dispos/off/indispo/pause vendredi du travailleur.
 */
export async function regeneratePlanningProposalAction(args: {
  employeeId: string;
  startDate: string;
  scheduleRecurrence?: string | null;
  templateId?: string | null;
}): Promise<{ ok?: boolean; error?: string; reason?: string | null }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const { employeeId, startDate } = args;
  if (!employeeId) return { error: "Employé requis." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Date de début invalide." };

  const admin = createAdminClient();

  // Résout le modèle si demandé.
  let template: PlanningTemplatePattern | null = null;
  if (args.templateId) {
    const { data } = await admin
      .from("planning_templates")
      .select("pattern")
      .eq("id", args.templateId)
      .maybeSingle();
    const p = (data as { pattern: PlanningTemplatePattern } | null)?.pattern ?? null;
    if (p) template = p;
  }

  const res = await regeneratePlanningProposal(admin, employeeId, {
    startDate,
    generatedBy: `manual:${profile.id}`,
    scheduleRecurrence: args.scheduleRecurrence ?? null,
    template,
  });
  if (!res.ok) return { error: res.reason ?? "Génération impossible." };

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, reason: res.proposal?.reason ?? null };
}

/**
 * Enregistre une VARIANTE affichée comme MODÈLE réutilisable (objet séparé,
 * persistant — jamais écrasé par une nouvelle génération). Le pattern est
 * ABSTRAIT (pas de dates) : start_offset (A=0 / B=1), heure début, durée shift,
 * heures cibles, nb semaines.
 */
export async function savePlanningTemplateAction(args: {
  employeeId: string;
  name: string;
  variant: "A" | "B" | "C";
  defaultStartTime: string;
  defaultShiftHours: number;
  weeklyHours: number;
  weeks: number;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const name = args.name?.trim();
  if (!name) return { error: "Donne un nom au modèle." };
  if (args.variant !== "A" && args.variant !== "B" && args.variant !== "C") {
    return { error: "Variante invalide." };
  }
  if (!args.defaultStartTime || !args.defaultShiftHours || !args.weeklyHours) {
    return { error: "Modèle incomplet (heure/durée/heures manquantes)." };
  }

  // C = répartition « spread » (pas d'offset de départ) ; A/B = offset consécutif.
  const pattern: PlanningTemplatePattern = {
    start_offset: args.variant === "A" ? 0 : args.variant === "B" ? 1 : 0,
    variant: args.variant,
    spread: args.variant === "C",
    default_start_time: args.defaultStartTime.slice(0, 5),
    default_shift_hours: Number(args.defaultShiftHours),
    weekly_hours: Number(args.weeklyHours),
    weeks: Number(args.weeks) || 3,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("planning_templates")
    .insert({
      name,
      source_employee_id: args.employeeId || null,
      pattern,
      created_by: `manual:${profile.id}`,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${args.employeeId}`);
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * PHASE 2 — Choisit la variante PAR DÉFAUT visible par le travailleur (tablette).
 * Écrit `planning_proposals.selected_variant` ('A', 'B' ou 'C'). Une seule à la
 * fois. Si aucune sélection n'est enregistrée, la tablette retombe sur 'A'.
 */
export async function setDefaultPlanningVariantAction(args: {
  employeeId: string;
  variant: "A" | "B" | "C";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employé requis." };
  if (args.variant !== "A" && args.variant !== "B" && args.variant !== "C") {
    return { error: "Variante invalide." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("planning_proposals")
    .update({ selected_variant: args.variant })
    .eq("employee_id", args.employeeId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${args.employeeId}`);
  return { ok: true };
}

/**
 * RENFORT — Active un CRÉNEAU DE RENFORT (heures sup) en VRAI shift, 1 clic.
 *
 * Karim 2026-07-09 : un travailleur APTE aux heures sup (`ot_eligible`) peut se voir
 * enchaîner, ponctuellement, un jour issu d'une variante NON sélectionnée (voir
 * `computeReinforcementSlots`). Cette action matérialise ce créneau : elle crée un
 * shift RÉEL marqué HEURES SUP (`is_overtime = true`) sur le SITE PRINCIPAL du
 * travailleur, en réutilisant l'horaire déjà construit par le moteur
 * (`startTime`/`endTime` du créneau : pauses hors heures, pause vendredi verrouillée
 * et échelonnement Brabant sont déjà baked dans `endTime`). AUCUN envoi au
 * travailleur — notification INTERNE RH uniquement.
 */
export async function activateReinforcementShiftAction(args: {
  employeeId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" (issu du créneau moteur)
  endTime: string; // "HH:MM" (fin déjà allongée par le moteur : pauses incluses)
  shiftHours: number; // heures TRAVAILLÉES du créneau (hors pauses)
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const { employeeId, date } = args;
  if (!employeeId) return { error: "Employé requis." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
  const startTime = (args.startTime ?? "").slice(0, 5);
  const endTime = (args.endTime ?? "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: "Horaire invalide." };
  }
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const startMin = toMin(startTime);
  const endMin = toMin(endTime);
  if (endMin <= startMin) return { error: "Heure de fin ≤ heure de début." };
  const workedMin = Math.round(Number(args.shiftHours || 0) * 60);
  if (workedMin <= 0) return { error: "Durée du créneau invalide." };
  // break_minutes = tout ce qui n'est pas travaillé dans la plage (pauses hors
  // heures). Le moteur a déjà allongé endTime d'autant -> on garde ses heures.
  const breakMinutes = Math.max(0, endMin - startMin - workedMin);

  const admin = createAdminClient();

  // 1) Employé + GATE apte aux heures sup (réutilise le flag existant ot_eligible).
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, ot_eligible, fixed_off_days")
    .eq("id", employeeId)
    .maybeSingle();
  const emp = empRaw as
    | { id: string; full_name: string; ot_eligible: boolean | null; fixed_off_days: number[] | null }
    | null;
  if (!emp) return { error: "Employé introuvable." };
  if (!emp.ot_eligible) {
    return {
      error: `${emp.full_name} n'est pas marqué apte aux heures sup — coche « Éligible aux heures supplémentaires » sur sa fiche d'abord.`,
    };
  }

  // 2) Jour OFF fixe (fixed_off_days : 0=Lun..6=Dim) — re-vérif (normalement déjà exclu).
  const [y, m, d] = date.split("-").map(Number);
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dim..6=Sam
  const isoDow = jsDow === 0 ? 6 : jsDow - 1; // 0=Lun..6=Dim
  if ((emp.fixed_off_days ?? []).includes(isoDow)) {
    return { error: "Jour OFF fixe du travailleur — renfort impossible." };
  }

  // 3) SITE PRINCIPAL actif (site_assignments is_primary couvrant la date).
  const { data: assignRaw } = await admin
    .from("site_assignments")
    .select("site_id, is_primary, start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .lte("start_date", date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const siteId = (assignRaw as { site_id: string } | null)?.site_id ?? null;
  if (!siteId) {
    return {
      error: "Aucun site principal actif à cette date — affecte un site principal avant d'activer un renfort.",
    };
  }

  // 4) ANTI-DOUBLE-BOOKING : aucun shift existant ce jour-là pour ce travailleur.
  const { data: existingRaw } = await admin
    .from("shifts")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .limit(1);
  if (((existingRaw ?? []) as unknown[]).length > 0) {
    return { error: "Ce travailleur a déjà un shift ce jour-là — renfort non ajouté." };
  }

  // 5) Congé approuvé couvrant la date.
  const { data: offRaw } = await admin
    .from("time_off_requests")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1);
  if (((offRaw ?? []) as unknown[]).length > 0) {
    return { error: "Travailleur en congé approuvé ce jour-là — renfort impossible." };
  }

  // 6) Indisponibilité déclarée (récurrente jour de semaine OU ponctuelle) qui
  //    chevauche le créneau (ou journée entière). Convention day_of_week = JS getDay.
  const { data: unavailRaw } = await admin
    .from("employee_unavailabilities")
    .select("day_of_week, date_specific, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("is_active", true);
  const unavail = (unavailRaw ?? []) as Array<{
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
  }>;
  const blocked = unavail.some((u) => {
    const matchDay =
      (u.day_of_week != null && u.day_of_week === jsDow) || u.date_specific === date;
    if (!matchDay) return false;
    if (!u.start_time || !u.end_time) return true; // journée entière
    return startMin < toMin(u.end_time) && endMin > toMin(u.start_time);
  });
  if (blocked) {
    return { error: "Indisponibilité déclarée ce jour-là — renfort impossible." };
  }

  // 7) Crée le VRAI shift, marqué HEURES SUP / RENFORT (is_overtime = true).
  const { error: insErr } = await admin.from("shifts").insert({
    employee_id: employeeId,
    site_id: siteId,
    date,
    start_time: startTime,
    end_time: endTime,
    break_minutes: breakMinutes,
    position: null,
    status: "planned",
    is_overtime: true,
    overtime_multiplier: 1.5,
    created_by: profile.id,
    notes: "Renfort (heures sup) — activé depuis la proposition de planning",
  });
  if (insErr) return { error: insErr.message };

  // 8) Notification INTERNE RH (aucun envoi au travailleur).
  const dateFr = (() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("fr-BE", {
        timeZone: "Europe/Brussels",
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    } catch {
      return date;
    }
  })();
  try {
    await notifyRoles(["admin", "rh"], {
      kind: "reinforcement_activated",
      title: "Renfort activé (heures sup)",
      body: `${emp.full_name} — ${dateFr} ${startTime}–${endTime} (${args.shiftHours}h).`,
      link: `/planning/employees/${employeeId}/calendar?view=week`,
      data: { employee_id: employeeId, date },
    });
  } catch {
    /* la notif ne doit pas bloquer la création du shift */
  }

  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath(`/planning/employees/${employeeId}/calendar`);
  return { ok: true };
}

/**
 * PHASE 3 — Génère (ou régénère) le CODE PERSONNEL d'accès au planning tablette.
 * Code court (6 chiffres), unique parmi les employés. Retry en cas de collision.
 * Communiqué MANUELLEMENT au travailleur (aucun envoi automatique).
 */
export async function generatePlanningAccessCodeAction(args: {
  employeeId: string;
}): Promise<{ ok?: boolean; error?: string; code?: string }> {
  await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employé requis." };

  const admin = createAdminClient();

  // 6 chiffres, jamais commençant par 0 (100000..999999) pour une longueur stable.
  const genCode = () => String(100000 + Math.floor(Math.random() * 900000));

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = genCode();
    // Vérifie l'unicité (l'index unique partiel garantit la cohérence en cas de course).
    const { data: clash } = await admin
      .from("employees")
      .select("id")
      .eq("planning_access_code", code)
      .maybeSingle();
    if (clash) continue;

    const { error } = await admin
      .from("employees")
      .update({ planning_access_code: code })
      .eq("id", args.employeeId);
    if (error) {
      // Course sur l'index unique -> on retente avec un autre code.
      if ((error as { code?: string }).code === "23505") continue;
      return { error: error.message };
    }
    revalidatePath(`/planning/employees/${args.employeeId}`);
    return { ok: true, code };
  }
  return { error: "Impossible de générer un code unique, réessaie." };
}
