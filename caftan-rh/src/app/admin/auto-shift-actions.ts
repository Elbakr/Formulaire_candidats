"use server";

// Karim 2026-07-11 : pilotage du mode AUTO-SHIFT (tablette).
//   * INDIVIDUEL : bascule employees.auto_shift (immédiat).
//   * GLOBAL     : programme la bascule à +10 min (org_settings), notifie l'admin
//                  (annulable), puis devient effective à l'échéance (lecture à la
//                  volée côté tablette, aucun cron).
// Annulation possible : depuis la notif, la fiche travailleur, ou le bandeau admin.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import {
  getGlobalAutoShiftState,
  GLOBAL_AUTO_SHIFT_DELAY_MIN,
  type GlobalAutoShiftState,
} from "@/lib/auto-shift";

/** Auto-Shift INDIVIDUEL d'un travailleur (immédiat). Exclusif d'Auto-Variant. */
export async function setWorkerAutoShiftAction(
  employeeId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();
  // Activer Auto-Shift coupe Auto-Variant (modes d'affichage mutuellement exclusifs).
  const patch = on ? { auto_shift: true, auto_variant: false } : { auto_shift: false };
  const { error } = await admin.from("employees").update(patch).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}

/** Auto-Variant INDIVIDUEL : la tablette choisit le variant du jour. Exclusif d'Auto-Shift. */
export async function setWorkerAutoVariantAction(
  employeeId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();
  const patch = on ? { auto_variant: true, auto_shift: false } : { auto_variant: false };
  const { error } = await admin.from("employees").update(patch).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}

/** Programme l'Auto-Shift GLOBAL à +10 min et notifie l'admin (annulable). */
export async function scheduleGlobalAutoShiftAction(): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const effective = new Date(Date.now() + GLOBAL_AUTO_SHIFT_DELAY_MIN * 60_000).toISOString();
  const { error } = await admin
    .from("org_settings")
    .update({ auto_shift_global_effective_at: effective })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  // Notif admin PRÉALABLE (préavis 10 min), avec lien direct vers l'annulation.
  try {
    await notifyRoles(["admin", "rh"], {
      kind: "auto_shift_global",
      title: `Auto-Shift GLOBAL dans ${GLOBAL_AUTO_SHIFT_DELAY_MIN} min`,
      body: "Toutes les tablettes basculeront sur le planning réel du jour. Ouvre pour ANNULER si ce n'est pas voulu.",
      link: "/admin/settings",
      data: { effective_at: effective },
    });
  } catch {
    /* la notif ne doit pas bloquer la programmation */
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Annule / désactive l'Auto-Shift GLOBAL (bascule programmée OU déjà active). */
export async function cancelGlobalAutoShiftAction(): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("org_settings")
    .update({ auto_shift_global_effective_at: null })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** État courant du mode global (pour le bandeau admin ultra-accessible). */
export async function getGlobalAutoShiftStateAction(): Promise<GlobalAutoShiftState> {
  await requireRole(["admin", "rh", "manager"]);
  return getGlobalAutoShiftState();
}

/** État pour le BANDEAU global (appelé depuis le layout, tous utilisateurs).
 *  Ne lève jamais : renvoie `canManage=false` (bandeau masqué) pour les non-admins
 *  et les visiteurs sans session (pages publiques). */
export async function getAutoShiftBannerAction(): Promise<
  GlobalAutoShiftState & { canManage: boolean }
> {
  let role: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = (data as { role?: string } | null)?.role ?? null;
    }
  } catch {
    role = null;
  }
  const canManage = role === "admin" || role === "rh";
  if (!canManage) return { state: "off", effective_at: null, canManage: false };
  return { ...(await getGlobalAutoShiftState()), canManage: true };
}
