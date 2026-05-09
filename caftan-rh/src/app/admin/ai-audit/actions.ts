"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function saveAiSettingsAction(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const lvlRaw = String(formData.get("ai_autonomy_level") ?? "0");
  const lvl = Math.max(0, Math.min(3, parseInt(lvlRaw, 10) || 0));
  const budgetRaw = String(formData.get("ai_budget_usd_monthly") ?? "50");
  const budget = Math.max(0, Number(budgetRaw) || 0);

  const payload = {
    ai_autonomy_level: lvl,
    ai_provider: String(formData.get("ai_provider") ?? "anthropic").trim() || "anthropic",
    ai_model_strong: String(formData.get("ai_model_strong") ?? "claude-sonnet-4-6").trim(),
    ai_model_fast: String(formData.get("ai_model_fast") ?? "claude-haiku-4-5-20251001").trim(),
    ai_budget_usd_monthly: budget,
  };
  const { error } = await supabase.from("org_settings").update(payload).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/ai-audit");
  return { ok: true };
}
