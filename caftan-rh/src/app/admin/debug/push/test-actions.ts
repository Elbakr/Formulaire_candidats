"use server";

import { requireProfile } from "@/lib/auth";
import { sendPushToProfiles } from "@/lib/push-notify";
import { createClient } from "@/lib/supabase/server";

/**
 * Envoie un push test au profile courant (l'admin qui clique). Utile pour
 * verifier rapidement sur iPhone que les push fonctionnent end-to-end.
 */
export async function sendTestPushToSelfAction(): Promise<{
  ok?: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  active_subs?: number;
}> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data: subsRaw } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("is_active", true);
  const activeSubs = ((subsRaw ?? []) as Array<{ id: string }>).length;
  if (activeSubs === 0) {
    return {
      error: "Aucune subscription active pour ton profil. Active d'abord les notifs sur le device cible.",
      active_subs: 0,
    };
  }
  const r = await sendPushToProfiles([profile.id], {
    title: "🔔 Test push CaftanRH",
    body: `Si tu vois ce message, les push fonctionnent ! Envoyé à ${new Date().toLocaleTimeString("fr-BE")}.`,
    link: "/admin/debug/push",
  });
  return { ok: true, sent: r.sent, failed: r.failed, active_subs: activeSubs };
}
