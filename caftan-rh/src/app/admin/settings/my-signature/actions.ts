"use server";

// Karim 2026-05-29 : action server pour sauver la signature stockee
// dans profiles.signature_data_url (dataURL base64).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveSignatureAction(
  dataUrl: string,
): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return { error: "DataURL invalide." };
  }
  // Sanity check taille (max 500KB en base64)
  if (dataUrl.length > 500 * 1024) {
    return { error: "Signature trop lourde (max 500KB)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      signature_data_url: dataUrl,
      signature_updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings/my-signature");
  return { ok: true };
}

export async function deleteSignatureAction(): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ signature_data_url: null, signature_updated_at: null })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/my-signature");
  return { ok: true };
}
