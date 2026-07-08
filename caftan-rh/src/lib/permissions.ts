// Karim 2026-07-08 : socle de permissions par utilisateur.
//
// Objectif : certaines fonctions sensibles (ex. les fiches de paie) ne sont PAS
// accessibles aux RH par défaut. L'admin peut les octroyer par utilisateur via
// /admin/users. L'admin a TOUT implicitement.
//
// Extensible : ajouter une clé dans PERMISSION_KEYS suffit pour la surfacer
// dans l'éditeur admin et pour la gater côté serveur avec requirePermission().

import { redirect } from "next/navigation";
import { requireProfile, roleHome } from "@/lib/auth";
import type { AppRole } from "@/types/database.types";

/** Clé technique d'une permission (stockée dans profiles.permissions[]). */
export type PermissionKey = "payslips";

/** Catalogue des permissions connues (affiché dans l'éditeur admin). */
export const PERMISSION_KEYS: { key: PermissionKey; label: string }[] = [
  { key: "payslips", label: "Fiches de paie" },
];

/**
 * Vrai si l'utilisateur a la permission `key`.
 * L'admin a TOUT. Sinon il faut que la clé soit présente dans son tableau.
 */
export function hasPermission(
  role: AppRole | string | null | undefined,
  permissions: string[] | null | undefined,
  key: PermissionKey,
): boolean {
  if (role === "admin") return true;
  return Array.isArray(permissions) && permissions.includes(key);
}

/**
 * Garde serveur : exige la permission `key` (admin OU permission octroyée).
 * Sinon redirige vers l'accueil du rôle (comme requireRole). À utiliser pour
 * protéger pages ET server actions sensibles.
 */
export async function requirePermission(key: PermissionKey) {
  const { user, profile } = await requireProfile();
  const perms = (profile as { permissions?: string[] | null }).permissions;
  if (!hasPermission(profile.role, perms, key)) {
    redirect(roleHome(profile.role));
  }
  return { user, profile };
}
