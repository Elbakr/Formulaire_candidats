// Karim 2026-07-08 : garde SERVEUR des permissions (séparée du helper pur pour ne
// pas tirer l'auth serveur dans les bundles CLIENT — cf. build Turbopack).
import "server-only";
import { redirect } from "next/navigation";
import { requireProfile, roleHome } from "@/lib/auth";
import { hasPermission, type PermissionKey } from "@/lib/permissions";

/**
 * Exige la permission `key` (admin OU permission octroyée). Sinon redirige vers
 * l'accueil du rôle (comme requireRole). À utiliser pour protéger pages ET server
 * actions sensibles.
 */
export async function requirePermission(key: PermissionKey) {
  const { user, profile } = await requireProfile();
  const perms = (profile as { permissions?: string[] | null }).permissions;
  if (!hasPermission(profile.role, perms, key)) {
    redirect(roleHome(profile.role));
  }
  return { user, profile };
}
