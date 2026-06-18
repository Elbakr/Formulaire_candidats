"use server";

// Karim 2026-06-18 : édition des entités juridiques (employeurs) + rattachement
// des sites. Auto-save par champ (cohérent avec le reste de l'app).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const EDITABLE = new Set([
  "name",
  "signature_label",
  "address",
  "locality",
  "bce",
  "onss",
  "rc",
  "representative",
  "co_representative",
  "co_representative_email",
  "paritary_commission",
  "email",
  "phone",
]);

export async function autosaveEmployerOrgAction(
  key: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!key) return { ok: false, error: "Entité manquante." };
  const patch: Record<string, string | null> = {};
  for (const k of Object.keys(values)) {
    if (!EDITABLE.has(k)) continue;
    const v = (values[k] ?? "").trim();
    // name & signature_label sont requis : jamais vidés par du vide.
    if ((k === "name" || k === "signature_label") && !v) continue;
    patch[k] = v || null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  const admin = createAdminClient();
  const { error } = await admin.from("employer_orgs").update(patch).eq("key", key);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/entities");
  return { ok: true };
}

export async function assignSiteToOrgAction(
  siteId: string,
  orgKey: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!siteId) return { ok: false, error: "Site manquant." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("sites")
    .update({ employer_org_key: orgKey || null })
    .eq("id", siteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/entities");
  return { ok: true };
}
