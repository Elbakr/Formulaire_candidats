"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { countTemplateVariables } from "@/lib/whatsapp/compliance";

const SLUG_RX = /^[a-z0-9][a-z0-9_-]*$/;
const VALID_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
const VALID_STATUSES = ["draft", "pending", "approved", "rejected"] as const;

export type SaveTemplateResult = { ok?: boolean; error?: string; id?: string };

export async function upsertWhatsAppTemplateAction(
  formData: FormData,
): Promise<SaveTemplateResult> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const language_code = String(formData.get("language_code") ?? "fr").trim() || "fr";
  const category = String(formData.get("category") ?? "UTILITY").trim();
  const body = String(formData.get("body") ?? "").trim();
  const twilio_content_sid =
    String(formData.get("twilio_content_sid") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "draft").trim();
  const is_active = formData.get("is_active") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!slug || !SLUG_RX.test(slug)) {
    return { error: "Slug invalide (a-z, 0-9, '_' ou '-' uniquement)." };
  }
  if (!body) return { error: "Le corps du template est requis." };
  if (body.length > 1024) return { error: "Corps du template trop long (max 1024 caractères)." };
  if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return { error: "Catégorie invalide." };
  }
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: "Statut invalide." };
  }

  const variables_count = countTemplateVariables(body);

  const patch: Record<string, unknown> = {
    slug,
    language_code,
    category,
    body,
    variables_count,
    twilio_content_sid,
    status,
    is_active,
    notes,
  };

  if (id) {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update(patch)
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/integrations/whatsapp/templates");
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .insert(patch)
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations/whatsapp/templates");
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteWhatsAppTemplateAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!id) return { error: "Id requis." };
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations/whatsapp/templates");
  return { ok: true };
}
