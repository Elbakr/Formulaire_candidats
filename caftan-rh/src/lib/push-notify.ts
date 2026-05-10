/**
 * Helper d'envoi de notifications WebPush PWA aux profils.
 *
 * Usage côté server actions / cron : appeler `sendPushToProfile` ou
 * `sendPushToProfiles` après l'insertion dans la table `notifications`.
 *
 * Tolérant aux erreurs : si VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY ne sont pas
 * configurés, on log un warning et retourne `{ sent: 0, failed: 0 }` sans
 * crasher l'action métier appelante. Si une subscription est invalide (410
 * Gone / 404), on la marque inactive plutôt que de la supprimer (audit trail).
 */
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

export type PushPayload = {
  title: string;
  body: string;
  link?: string | null;
  /** 'urgent' force `requireInteraction: true` côté client. */
  priority?: "normal" | "important" | "urgent";
  /** Identifiant logique pour dédupliquer côté OS. */
  tag?: string;
};

let vapidConfigured: boolean | null = null;

function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hr@caftanfactory.com";
  if (!pub || !priv) {
    console.warn(
      "[push-notify] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants — " +
        "push désactivés. `npm run vapid:generate` puis ajoute les clés dans .env.local.",
    );
    vapidConfigured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.warn("[push-notify] setVapidDetails a échoué:", err);
    vapidConfigured = false;
    return false;
  }
}

type Sub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Envoie un push à un profil. Si plusieurs devices, envoie à toutes les subs
 * actives en parallèle.
 */
export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId)
    .eq("is_active", true);
  const subs = (data ?? []) as Sub[];
  if (subs.length === 0) return { sent: 0, failed: 0 };
  return await deliver(subs, payload);
}

/**
 * Envoie un push à plusieurs profils. Idéal pour cron (ex. dimona reminder
 * → tous les admins).
 */
export async function sendPushToProfiles(
  profileIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 };
  if (profileIds.length === 0) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", profileIds)
    .eq("is_active", true);
  const subs = (data ?? []) as Sub[];
  if (subs.length === 0) return { sent: 0, failed: 0 };
  return await deliver(subs, payload);
}

async function deliver(
  subs: Sub[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
    priority: payload.priority ?? "normal",
    tag: payload.tag ?? null,
  });
  let sent = 0;
  let failed = 0;
  const deactivateIds: string[] = [];
  const now = new Date().toISOString();

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          {
            TTL: 60 * 60, // 1h
            urgency: payload.priority === "urgent" ? "high" : "normal",
          },
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint mort — désactive cette sub.
          deactivateIds.push(s.id);
        } else {
          console.warn(
            "[push-notify] échec envoi (",
            status ?? "?",
            "):",
            (err as Error).message ?? err,
          );
        }
      }
    }),
  );

  if (deactivateIds.length > 0) {
    await admin
      .from("push_subscriptions")
      .update({ is_active: false })
      .in("id", deactivateIds);
  }
  if (sent > 0) {
    await admin
      .from("push_subscriptions")
      .update({ last_used_at: now })
      .in(
        "id",
        subs.filter((_, i) => !deactivateIds.includes(subs[i].id)).map((s) => s.id),
      );
  }
  return { sent, failed };
}

/** Pour `/admin/settings` — savoir si la pile push est armée. */
export function pushIsConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Pour le client : exposer la clé publique sans charger web-push côté navigateur. */
export function getPublicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
