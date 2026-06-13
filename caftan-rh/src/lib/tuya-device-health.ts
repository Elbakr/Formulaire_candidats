// Karim 2026-06-13 : alerte "terminal de pointage hors-ligne".
//
// Contexte : le terminal Anvers (Pointage C et F) est tombe hors-ligne le 12/06
// sans que personne ne soit prevenu -> aucune presence Anvers pendant des jours.
// On verifie l'etat ONLINE des terminaux Tuya (via l'API Tuya) aux deux moments
// cles ou ils DOIVENT repondre :
//   - le matin (~10h00, ouverture),
//   - le soir  (18h30-20h30, fermeture, "selon le site").
// Si un terminal pointage actif est hors-ligne dans une de ces fenetres, on
// notifie + push les admins/RH (anti-spam : 1 alerte / 4h / terminal).
//
// Appele depuis le cron tuya-poll (toutes les 5 min) : la fenetre horaire fait
// le filtrage, pas besoin d'un cron dedie.

import { createAdminClient } from "@/lib/supabase/server";
import { getTuyaDeviceDetail } from "@/lib/tuya-client";
import { sendPushToProfile } from "@/lib/push-notify";

export type DeviceHealthResult = {
  in_window: boolean;
  checked: number;
  offline: string[];
  alerted: number;
};

function brusselsHourMinute(): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { h, m };
}

/** Vrai si on est dans la fenetre d'ouverture (matin) ou de fermeture (soir). */
function isCheckWindow(): boolean {
  const { h, m } = brusselsHourMinute();
  const morning = h === 10 && m <= 30; // ~10h00-10h30
  const evening = (h === 18 && m >= 30) || h === 19 || (h === 20 && m <= 30); // 18h30-20h30
  return morning || evening;
}

export async function checkOfflineDevicesAndAlert(): Promise<DeviceHealthResult> {
  const res: DeviceHealthResult = { in_window: isCheckWindow(), checked: 0, offline: [], alerted: 0 };
  if (!res.in_window) return res; // hors fenetre matin/soir : on ne fait rien.

  const admin = createAdminClient();
  const { data: devs } = await admin
    .from("tuya_devices")
    .select("tuya_device_id, tuya_device_name")
    .eq("is_active", true)
    .eq("is_pointage", true);
  const devices = (devs ?? []) as Array<{ tuya_device_id: string; tuya_device_name: string | null }>;
  res.checked = devices.length;

  // Notifs offline recentes (4h) pour l'anti-spam.
  const since = new Date(Date.now() - 4 * 3600_000).toISOString();
  const { data: recentRaw } = await admin
    .from("notifications")
    .select("data, created_at")
    .eq("kind", "tuya_device_offline")
    .gte("created_at", since);
  const recentlyAlerted = new Set(
    ((recentRaw ?? []) as Array<{ data: { device_id?: string } | null }>)
      .map((r) => r.data?.device_id)
      .filter(Boolean) as string[],
  );

  const { data: adminsRaw } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
  const adminIds = ((adminsRaw ?? []) as Array<{ id: string }>).map((a) => a.id);

  for (const d of devices) {
    let online = true;
    try {
      const detail = await getTuyaDeviceDetail(d.tuya_device_id);
      // detail null = API indisponible : on NE crie PAS au loup (evite faux positifs).
      online = detail ? detail.is_online : true;
    } catch {
      online = true;
    }
    if (online) continue;

    const name = d.tuya_device_name ?? d.tuya_device_id;
    res.offline.push(name);
    if (recentlyAlerted.has(d.tuya_device_id)) continue; // deja alerte < 4h

    const title = `🔴 Terminal de pointage hors-ligne : ${name}`;
    const body = `Le terminal "${name}" ne répond plus (déconnecté du cloud Tuya). Les pointages de ce site ne remontent PAS. Vérifie son alimentation et sa connexion internet au magasin.`;
    const link = "/admin/tuya/devices";
    for (const rid of adminIds) {
      const { data: ins } = await admin
        .from("notifications")
        .insert({
          recipient_id: rid,
          kind: "tuya_device_offline",
          title,
          body,
          link,
          data: { device_id: d.tuya_device_id, device_name: name },
        })
        .select("id")
        .single();
      if (!ins) continue;
      try {
        await sendPushToProfile(rid, { title, body, link, priority: "urgent", tag: `tuya-offline-${d.tuya_device_id}` });
      } catch {
        /* push best-effort */
      }
    }
    res.alerted++;
  }
  return res;
}
