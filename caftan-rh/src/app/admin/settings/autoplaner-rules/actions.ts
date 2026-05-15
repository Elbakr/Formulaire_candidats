"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  AUTOPLANER_RULES,
  buildDefaultRules,
  mergeWithDefaults,
  type AutoplanerRulesState,
} from "@/lib/autoplaner-rules";

export async function loadAutoplanerRulesAction(): Promise<AutoplanerRulesState> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("autoplaner_rules")
    .eq("id", 1)
    .maybeSingle();
  const cfg = (data as { autoplaner_rules: Record<string, unknown> | null } | null)
    ?.autoplaner_rules;
  return mergeWithDefaults(cfg ?? null);
}

export async function updateAutoplanerRuleAction(
  ruleId: string,
  enabled: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!AUTOPLANER_RULES.some((r) => r.id === ruleId)) {
    return { error: `Règle inconnue : ${ruleId}` };
  }
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("org_settings")
    .select("autoplaner_rules")
    .eq("id", 1)
    .maybeSingle();
  const cur =
    ((row as { autoplaner_rules: Record<string, unknown> | null } | null)
      ?.autoplaner_rules as Record<string, boolean>) ?? {};
  const next = { ...cur, [ruleId]: enabled };
  const { error } = await supabase
    .from("org_settings")
    .update({ autoplaner_rules: next })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/autoplaner-rules");
  revalidatePath("/planning", "layout");
  return { ok: true };
}

export async function resetAutoplanerRulesAction(): Promise<{
  ok?: boolean;
  error?: string;
}> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const defaults = buildDefaultRules();
  const { error } = await supabase
    .from("org_settings")
    .update({ autoplaner_rules: defaults })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/autoplaner-rules");
  return { ok: true };
}
