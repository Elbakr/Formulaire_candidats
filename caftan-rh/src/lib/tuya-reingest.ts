// Karim 2026-06-16 : Re-ingestion Tuya sur une fenetre temporelle explicite.
//
// PROBLEME RESOLU : quand un badge Tuya arrive sur un slot NON mappe, il est
// drope (perdu dans tuya_unmapped_slots). Si on mappe le slot plus tard, les
// badges anterieurs restent orphelins car pollTuyaLogs n avance que vers
// l avant (last_log_access_time).
//
// reingestTuyaWindow re-fetche une fenetre explicite (defaut 2j), IGNORE le
// last_log_access_time, et passe chaque event par la MEME logique metier que
// pollTuyaLogs via processTuyaEvents (partagee, pas dupliquee).
// Anti-doublon : tuya_access_log_id unique, + garde-fou dedup <2 min dans
// processTuyaEvents. Les entries deja presentes sont silencieusement ignorees.
//
// Usage principal : declenche en best-effort dans quickEnrollAction,
// addMappingAction, updateMappingAction, addFingerprintMappingAction
// APRES creation/activation du mapping pour recuperer immediatement les
// badges recemment droppes de ce slot.

import { createAdminClient } from "@/lib/supabase/server";
import { fetchUnlockLogs, parseUnlockValue } from "@/lib/tuya-client";
import { processTuyaEvents, type DeviceRow, type MappingRow } from "@/lib/tuya-poll";

export type ReingestResult = {
  ok: boolean;
  error?: string;
  /** Nombre d events fetches depuis l API Tuya */
  fetched: number;
  /** Nombre de clock_entries effectivement inseres */
  inserted: number;
  /** Events dont le mapping existait et qui ont ete traites */
  mapped: number;
  /** Events toujours sans mapping apres re-ingestion */
  still_unmapped: number;
  errors: string[];
};

const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30j max (limite Tuya)
const DEFAULT_SINCE_DAYS = 2;

/**
 * Re-ingere les unlock events Tuya sur une fenetre passee en ignorant le
 * last_log_access_time (refetch force).
 *
 * @param options.sinceDays Fenetre en jours depuis maintenant (defaut 2, max 30).
 * @param options.deviceId  Si fourni, limite la re-ingestion a ce seul device.
 *
 * @returns Résumé { fetched, inserted, mapped, still_unmapped, errors }.
 */
export async function reingestTuyaWindow(options?: {
  sinceDays?: number;
  deviceId?: string;
}): Promise<ReingestResult> {
  const out: ReingestResult = {
    ok: true,
    fetched: 0,
    inserted: 0,
    mapped: 0,
    still_unmapped: 0,
    errors: [],
  };

  const supabase = createAdminClient();

  // 1. Charge les devices cibles (tous ou un seul)
  let devQ = supabase
    .from("tuya_devices")
    .select("tuya_device_id, tuya_device_name, site_id, fallback_for_site_ids")
    .eq("is_active", true)
    .eq("is_pointage", true);
  if (options?.deviceId) {
    devQ = devQ.eq("tuya_device_id", options.deviceId);
  }
  const { data: devicesRaw, error: devErr } = await devQ;
  if (devErr) {
    return { ...out, ok: false, error: `load devices: ${devErr.message}` };
  }
  const devices = (devicesRaw ?? []) as DeviceRow[];
  if (devices.length === 0) return out;

  const deviceIds = devices.map((d) => d.tuya_device_id);

  // 2. Charge TOUS les mappings actifs pour ces devices (y compris le mapping
  //    qui vient d etre cree - c est l interet principal de la re-ingestion).
  const { data: mappingsRaw } = await supabase
    .from("tuya_user_mapping")
    .select("id, tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, is_active")
    .eq("is_active", true)
    .in("tuya_device_id", deviceIds);
  const mappings = (mappingsRaw ?? []) as MappingRow[];

  // 3. Fenetre temporelle
  const sinceDays = Math.max(1, Math.min(30, options?.sinceDays ?? DEFAULT_SINCE_DAYS));
  const now = Date.now();
  const since = Math.max(now - sinceDays * 86400_000, now - MAX_LOOKBACK_MS);

  // 4. Pour chaque device, re-fetch et re-traite
  for (const dev of devices) {
    let logs;
    try {
      logs = await fetchUnlockLogs({
        deviceId: dev.tuya_device_id,
        startTime: since,
        endTime: now,
        size: 50,
      });
    } catch (e) {
      out.errors.push(
        `${dev.tuya_device_name ?? dev.tuya_device_id}: fetch ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    out.fetched += logs.length;
    if (logs.length === 0) continue;

    // Compte les events mappables AVANT traitement pour le champ `mapped`
    const mappableCount = logs.filter((log) => {
      const parsed = parseUnlockValue(log.value, log.code);
      const uid = parsed.user_id_in_device != null ? String(parsed.user_id_in_device) : null;
      if (!uid) return false;
      return mappings.some(
        (m) => m.tuya_device_id === dev.tuya_device_id && m.tuya_user_id === uid,
      );
    }).length;
    out.mapped += mappableCount;
    out.still_unmapped += logs.length - mappableCount;

    // Delègue le traitement a processTuyaEvents (logique partagee avec poll)
    const evResult = await processTuyaEvents(logs, dev, mappings, supabase);
    out.inserted += evResult.inserted;
    out.errors.push(...evResult.errors);
    // Note : les skipped (duplicate / no_mapping) ne sont pas remontés dans
    // ReingestResult car attendus lors d une re-ingestion (doublons existants).
  }

  return out;
}
