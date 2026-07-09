"use server";

// Karim 2026-07-09 : actions fiche employé pour la PROPOSITION DE PLANNING
// (Phase 1). (Re)génération manuelle 1-clic + enregistrement d'un MODÈLE
// réutilisable. AUCUN envoi au travailleur.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
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
  variant: "A" | "B";
  defaultStartTime: string;
  defaultShiftHours: number;
  weeklyHours: number;
  weeks: number;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const name = args.name?.trim();
  if (!name) return { error: "Donne un nom au modèle." };
  if (args.variant !== "A" && args.variant !== "B") return { error: "Variante invalide." };
  if (!args.defaultStartTime || !args.defaultShiftHours || !args.weeklyHours) {
    return { error: "Modèle incomplet (heure/durée/heures manquantes)." };
  }

  const pattern: PlanningTemplatePattern = {
    start_offset: args.variant === "A" ? 0 : 1,
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
 * Écrit `planning_proposals.selected_variant` ('A' ou 'B'). Une seule à la fois.
 * Si aucune sélection n'est enregistrée, la tablette retombe sur 'A' par défaut.
 */
export async function setDefaultPlanningVariantAction(args: {
  employeeId: string;
  variant: "A" | "B";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employé requis." };
  if (args.variant !== "A" && args.variant !== "B") return { error: "Variante invalide." };

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
