// WhatsApp via Twilio — server-side helpers.
//
// `getTwilioClient()` returns a configured Twilio client + the sender number,
// or `null` if WhatsApp is not enabled / not configured.
//
// `normalizePhoneE164()` converts free-form Belgian phone strings into the
// E.164 format Twilio expects (+32...). Returns null when the input is too short.

import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/server";

export type WhatsAppSettings = {
  id: number;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_whatsapp_number: string | null;
  is_sandbox: boolean | null;
  webhook_url: string | null;
  enabled: boolean | null;
  last_send_at: string | null;
  last_inbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TwilioBundle = {
  client: ReturnType<typeof twilio>;
  fromNumber: string;
  settings: WhatsAppSettings;
};

export async function getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("whatsapp_settings").select("*").eq("id", 1).maybeSingle();
  return (data as WhatsAppSettings | null) ?? null;
}

export async function getTwilioClient(): Promise<TwilioBundle | null> {
  const data = await getWhatsAppSettings();
  if (!data) return null;
  if (!data.twilio_account_sid || !data.twilio_auth_token || !data.enabled) {
    return null;
  }
  if (!data.twilio_whatsapp_number) return null;
  return {
    client: twilio(data.twilio_account_sid, data.twilio_auth_token),
    fromNumber: data.twilio_whatsapp_number,
    settings: data,
  };
}

/**
 * Normalize a phone string to E.164 (assumes Belgium when no country code is present).
 * Returns null when the input is too short or empty.
 */
export function normalizePhoneE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;

  // Already E.164 ?
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;

  if (digits.startsWith("00")) return "+" + digits.slice(2);
  // Belgian country code already present
  if (digits.startsWith("32") && digits.length >= 10) return "+" + digits;
  // BE mobile without leading 0 (e.g. "468596100" → +32468596100)
  if (digits.length === 9 && digits.startsWith("4")) return "+32" + digits;
  // BE national 0 prefix
  if (digits.startsWith("0")) return "+32" + digits.slice(1);

  return trimmed.startsWith("+") ? trimmed : `+${digits}`;
}

/**
 * Convert E.164 (or close) into Twilio's "whatsapp:+32…" address form.
 */
export function toWhatsAppAddress(e164OrPhone: string): string {
  const normalized = e164OrPhone.startsWith("whatsapp:")
    ? e164OrPhone.slice("whatsapp:".length)
    : e164OrPhone;
  const ensured = normalized.startsWith("+") ? normalized : normalizePhoneE164(normalized);
  return `whatsapp:${ensured ?? normalized}`;
}

/**
 * Strip "whatsapp:" prefix to expose just the +E164 phone.
 */
export function fromWhatsAppAddress(address: string): string {
  return address.startsWith("whatsapp:") ? address.slice("whatsapp:".length) : address;
}
