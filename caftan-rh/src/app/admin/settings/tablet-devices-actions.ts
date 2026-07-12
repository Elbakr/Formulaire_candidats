"use server";

// Karim 2026-07-12 : gestion des JETONS MULTI-TABLETTES (A..G). Chaque tablette a un
// lien /t/<jeton> unique et secret. Régénérer invalide l'ancien lien (à reconfigurer
// sur l'appareil). Réservé admin.

import crypto from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url"); // ~43 chars
}

/** (Re)génère le jeton d'une tablette (par code A..G). Réactive la tablette. */
export async function regenerateTabletDeviceAction(
  code: string,
): Promise<{ ok?: true; token?: string; error?: string }> {
  await requireRole(["admin"]);
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return { error: "Code tablette manquant." };
  const admin = createAdminClient();
  const token = newToken();
  // Nouveau jeton -> on DÉLIE l'appareil (le prochain appareil qui ouvre s'enrôle).
  const { error } = await admin
    .from("tablet_devices")
    .update({ token, active: true, bound_secret: null, bound_at: null })
    .eq("code", c);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true, token };
}

/** Réinitialise le VERROUILLAGE APPAREIL : la tablette pourra être ré-enrôlée sur un
 *  nouvel appareil (remplacement/perte). Le lien reste le même. */
export async function resetTabletBindingAction(
  code: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return { error: "Code tablette manquant." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("tablet_devices")
    .update({ bound_secret: null, bound_at: null })
    .eq("code", c);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Active / désactive une tablette (désactivé = lien 404). */
export async function setTabletDeviceActiveAction(
  code: string,
  active: boolean,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return { error: "Code tablette manquant." };
  const admin = createAdminClient();
  const { error } = await admin.from("tablet_devices").update({ active }).eq("code", c);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Ajoute une nouvelle tablette (nouveau code) avec un jeton neuf. */
export async function addTabletDeviceAction(
  code: string,
  label?: string,
): Promise<{ ok?: true; token?: string; error?: string }> {
  await requireRole(["admin"]);
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return { error: "Code tablette manquant." };
  const admin = createAdminClient();
  const token = newToken();
  const { error } = await admin
    .from("tablet_devices")
    .insert({ code: c, label: label?.trim() || null, token, active: true });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `La tablette ${c} existe déjà.` : error.message };
  revalidatePath("/admin/settings");
  return { ok: true, token };
}
