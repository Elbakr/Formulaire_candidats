// Karim 2026-07-11 : état du mode AUTO-SHIFT (tablette).
//
// Auto-Shift = la tablette affiche le planning RÉEL du travailleur (table
// `shifts`) au lieu du variant coché. Deux niveaux :
//   * INDIVIDUEL : employees.auto_shift (immédiat).
//   * GLOBAL     : org_settings.auto_shift_global_effective_at.
//        NULL      -> off ; > now() -> programmé (fenêtre 10 min) ; <= now() -> actif.
//
// Server-only : ne pas importer côté client (utiliser les server actions).

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

export type GlobalAutoShiftState = {
  state: "off" | "pending" | "active";
  /** ISO de bascule (null si off). En 'pending', c'est l'heure d'activation. */
  effective_at: string | null;
};

/** Délai de préavis avant bascule GLOBALE (minutes). */
export const GLOBAL_AUTO_SHIFT_DELAY_MIN = 10;

export async function getGlobalAutoShiftState(admin?: Admin): Promise<GlobalAutoShiftState> {
  const a = admin ?? createAdminClient();
  const { data } = await a
    .from("org_settings")
    .select("auto_shift_global_effective_at")
    .eq("id", 1)
    .maybeSingle();
  const at =
    (data as { auto_shift_global_effective_at: string | null } | null)
      ?.auto_shift_global_effective_at ?? null;
  if (!at) return { state: "off", effective_at: null };
  const effMs = new Date(at).getTime();
  return { state: Date.now() >= effMs ? "active" : "pending", effective_at: at };
}

/** Le mode global est-il EFFECTIF (bascule passée) ? */
export async function isGlobalAutoShiftActive(admin?: Admin): Promise<boolean> {
  return (await getGlobalAutoShiftState(admin)).state === "active";
}

/** Auto-Shift effectif pour CE travailleur (individuel OU global actif). */
export async function isAutoShiftActiveFor(
  admin: Admin,
  employee: { auto_shift?: boolean | null },
): Promise<boolean> {
  if (employee.auto_shift === true) return true;
  return isGlobalAutoShiftActive(admin);
}
