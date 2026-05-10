"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function saveWhatsAppSettingsAction(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const twilio_account_sid = String(formData.get("twilio_account_sid") ?? "").trim();
  const twilio_auth_token = String(formData.get("twilio_auth_token") ?? "").trim();
  const twilio_whatsapp_number = String(formData.get("twilio_whatsapp_number") ?? "").trim();
  const is_sandbox = formData.get("is_sandbox") === "on";
  const enabled = formData.get("enabled") === "on";
  const webhook_url = String(formData.get("webhook_url") ?? "").trim() || null;

  // Build patch — keep existing token when the field is left empty (mask UX)
  const patch: Record<string, unknown> = {
    twilio_account_sid: twilio_account_sid || null,
    twilio_whatsapp_number: twilio_whatsapp_number || null,
    is_sandbox,
    enabled,
    webhook_url,
  };
  if (twilio_auth_token && twilio_auth_token !== "********") {
    patch.twilio_auth_token = twilio_auth_token;
  }

  const { error } = await supabase.from("whatsapp_settings").update(patch).eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}

export async function saveWhatsAppComplianceAction(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const dailyRaw = Number(formData.get("daily_send_limit") ?? 250);
  const hourlyRaw = Number(formData.get("hourly_send_limit") ?? 60);
  const minSecondsRaw = Number(formData.get("min_seconds_between_sends") ?? 5);
  const require_opt_in = formData.get("require_opt_in") === "on";
  const enforce_24h_window = formData.get("enforce_24h_window") === "on";
  const out_of_window_template_slug =
    String(formData.get("out_of_window_template_slug") ?? "").trim() || null;

  // Clamp to safe ranges (anti-burst).
  const daily_send_limit = clamp(Math.floor(dailyRaw || 250), 1, 10000);
  const hourly_send_limit = clamp(Math.floor(hourlyRaw || 60), 1, 1000);
  const min_seconds_between_sends = clamp(Math.floor(minSecondsRaw || 5), 0, 600);

  const patch: Record<string, unknown> = {
    daily_send_limit,
    hourly_send_limit,
    min_seconds_between_sends,
    require_opt_in,
    enforce_24h_window,
    out_of_window_template_slug,
  };

  const { error } = await supabase.from("whatsapp_settings").update(patch).eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/integrations/whatsapp");
  return { ok: true };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
