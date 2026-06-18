"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchUnlockLogs, listDeviceUsers, parseUnlockValue } from "@/lib/tuya-client";
import { reingestTuyaWindow } from "@/lib/tuya-reingest";

export type ResolvedLog = {
  device_id: string;
  device_name: string | null;
  event_time: number;
  iso: string;
  user_id_in_device: number | null;
  method_label: string | null;
  status: string | null;
  raw_value: string;
  employee_id: string | null;
  employee_name: string | null;
  direction: "in" | "out" | null;
  mapped: boolean;
  already_in_clock_entries: boolean;
};

/**
 * Fetch en direct les unlock events des terminaux pointage actifs sur les
 * derniers `lookbackHours` heures, et resout chaque event vers l employe
 * grace aux mappings tuya_user_mapping.
 */
export async function fetchTuyaLogsAction(args: {
  lookbackHours?: number; // default 24h
  deviceId?: string | "all";
}): Promise<{
  ok: boolean;
  error?: string;
  logs: ResolvedLog[];
  devicesQueried: number;
  unmappedUserIds: Array<{ device_id: string; device_name: string | null; tuya_user_id: string; count: number }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const lookback = Math.max(1, Math.min(168, args.lookbackHours ?? 24));
  const endTime = Date.now();
  const startTime = endTime - lookback * 3600_000;

  // 1. Charge devices pointage actifs (ou un seul si specifie)
  let devQ = supabase
    .from("tuya_devices")
    .select("tuya_device_id, tuya_device_name")
    .eq("is_active", true)
    .eq("is_pointage", true);
  if (args.deviceId && args.deviceId !== "all") {
    devQ = devQ.eq("tuya_device_id", args.deviceId);
  }
  const { data: devicesRaw, error: devErr } = await devQ;
  if (devErr) return { ok: false, error: devErr.message, logs: [], devicesQueried: 0, unmappedUserIds: [] };
  const devices = (devicesRaw ?? []) as { tuya_device_id: string; tuya_device_name: string | null }[];
  if (devices.length === 0) {
    return { ok: true, logs: [], devicesQueried: 0, unmappedUserIds: [] };
  }

  // 2. Mappings actifs pour resoudre tuya_user_id -> employe
  const { data: mappingsRaw } = await supabase
    .from("tuya_user_mapping")
    .select("tuya_device_id, tuya_user_id, employee_id, direction, is_active")
    .eq("is_active", true);
  type MappingRow = { tuya_device_id: string | null; tuya_user_id: string; employee_id: string; direction: "in" | "out"; is_active: boolean };
  const mappings = (mappingsRaw ?? []) as MappingRow[];
  const mappingByKey = new Map<string, MappingRow>();
  for (const m of mappings) {
    mappingByKey.set(`${m.tuya_device_id}|${m.tuya_user_id}|${m.direction}`, m);
  }
  // Pour resolution employee si direction inconnue, on prend le premier match
  const mappingByDeviceUser = new Map<string, MappingRow>();
  for (const m of mappings) {
    const k = `${m.tuya_device_id}|${m.tuya_user_id}`;
    if (!mappingByDeviceUser.has(k)) mappingByDeviceUser.set(k, m);
  }

  const empIds = [...new Set(mappings.map((m) => m.employee_id))];
  const { data: empsRaw } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };
  const empById = new Map(((empsRaw ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));

  // 3. Pour chaque device, fetch unlock logs
  const allLogs: ResolvedLog[] = [];
  const unmappedCounts = new Map<string, number>();

  for (const dev of devices) {
    try {
      const logs = await fetchUnlockLogs({
        deviceId: dev.tuya_device_id,
        startTime,
        endTime,
        size: 50,
      });
      for (const log of logs) {
        const parsed = parseUnlockValue(log.value, log.code);
        const userIdLocal = parsed.user_id_in_device != null ? String(parsed.user_id_in_device) : null;
        const mapping = userIdLocal
          ? mappingByDeviceUser.get(`${dev.tuya_device_id}|${userIdLocal}`)
          : undefined;
        const isMapped = !!mapping;

        if (userIdLocal && !isMapped) {
          const k = `${dev.tuya_device_id}|${userIdLocal}`;
          unmappedCounts.set(k, (unmappedCounts.get(k) ?? 0) + 1);
        }

        allLogs.push({
          device_id: dev.tuya_device_id,
          device_name: dev.tuya_device_name,
          event_time: log.event_time,
          iso: new Date(log.event_time).toISOString(),
          user_id_in_device: parsed.user_id_in_device ?? null,
          method_label: parsed.method_label ?? null,
          status: log.status ?? null,
          raw_value: log.value,
          employee_id: mapping?.employee_id ?? null,
          employee_name: mapping ? empById.get(mapping.employee_id) ?? null : null,
          direction: mapping?.direction ?? null,
          mapped: isMapped,
          already_in_clock_entries: false, // resolu en bulk apres
        });
      }
    } catch (e) {
      allLogs.push({
        device_id: dev.tuya_device_id,
        device_name: dev.tuya_device_name,
        event_time: Date.now(),
        iso: new Date().toISOString(),
        user_id_in_device: null,
        method_label: `ERREUR API: ${e instanceof Error ? e.message : String(e)}`,
        status: "error",
        raw_value: "",
        employee_id: null,
        employee_name: null,
        direction: null,
        mapped: false,
        already_in_clock_entries: false,
      });
    }
  }

  // 4. Check quels access_log_ids sont deja dans clock_entries
  if (allLogs.length > 0) {
    const accessIds = allLogs
      .filter((l) => l.user_id_in_device !== null && l.raw_value)
      .map((l) => `${l.device_id}_${l.event_time}_${l.user_id_in_device}`);
    if (accessIds.length > 0) {
      const { data: existingRaw } = await supabase
        .from("clock_entries")
        .select("tuya_access_log_id")
        .in("tuya_access_log_id", accessIds);
      const existing = new Set(
        ((existingRaw ?? []) as { tuya_access_log_id: string }[]).map((x) => x.tuya_access_log_id),
      );
      for (const l of allLogs) {
        const id = `${l.device_id}_${l.event_time}_${l.user_id_in_device}`;
        l.already_in_clock_entries = existing.has(id);
      }
    }
  }

  // 5. Sort by event_time desc
  allLogs.sort((a, b) => b.event_time - a.event_time);

  const unmappedUserIds = [...unmappedCounts.entries()]
    .map(([k, count]) => {
      const [device_id, tuya_user_id] = k.split("|");
      const dev = devices.find((d) => d.tuya_device_id === device_id);
      return {
        device_id,
        device_name: dev?.tuya_device_name ?? null,
        tuya_user_id,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { ok: true, logs: allLogs, devicesQueried: devices.length, unmappedUserIds };
}

/**
 * Enrolement rapide : 1 clic depuis /admin/tuya/logs sur un event non-mappe
 * pour creer le mapping employee_id + direction.
 */
export async function quickEnrollAction(args: {
  tuya_device_id: string;
  tuya_user_id: string;
  employee_id: string;
  direction: "in" | "out";
  tuya_name?: string | null;
}): Promise<{ ok: boolean; error?: string; recovered?: number }> {
  await requireRole(["admin"]);
  if (!args.tuya_device_id || !args.tuya_user_id || !args.employee_id) {
    return { ok: false, error: "device, tuya_user_id et employé requis" };
  }
  if (args.direction !== "in" && args.direction !== "out") {
    return { ok: false, error: "direction invalide" };
  }
  // Karim 2026-06-14 : on passe par le SERVICE-ROLE (action déjà admin-gated par
  // requireRole). Avant, l'upsert via le client authentifié pouvait renvoyer
  // "ok" sans écrire (0 ligne touchée) -> toast vert mais le slot restait NULL
  // (cas confirmé sur les mappings E de Ilham/Omaima/Salmane/Remiki/Ibtissem).
  const admin = createAdminClient();
  // UPSERT (au lieu d INSERT pur) pour gerer le cas ou un mapping name-based
  // pre-existe (migration 406 : tuya_user_id=null + tuya_user_id_alpha=chaine).
  const { error } = await admin
    .from("tuya_user_mapping")
    .upsert(
      {
        tuya_device_id: args.tuya_device_id,
        tuya_user_id: args.tuya_user_id,
        employee_id: args.employee_id,
        direction: args.direction,
        tuya_name: args.tuya_name?.trim() || null,
        is_active: true,
      },
      { onConflict: "tuya_device_id,employee_id,direction" },
    );
  if (error) return { ok: false, error: error.message };

  // VÉRIFICATION : on relit la ligne et on confirme que le slot a bien atterri.
  // Un "succès" ne s'affiche QUE si l'écriture est réellement persistée.
  const { data: check } = await admin
    .from("tuya_user_mapping")
    .select("tuya_user_id")
    .eq("tuya_device_id", args.tuya_device_id)
    .eq("employee_id", args.employee_id)
    .eq("direction", args.direction)
    .maybeSingle();
  const saved = (check as { tuya_user_id: string | null } | null)?.tuya_user_id ?? null;
  if (String(saved ?? "") !== String(args.tuya_user_id)) {
    return { ok: false, error: `Écriture non confirmée (slot enregistré="${saved}" au lieu de "${args.tuya_user_id}"). Signale-le à Karim.` };
  }

  revalidatePath("/admin/tuya/logs");
  revalidatePath("/admin/tuya/users");

  // Re-ingestion : recupere les badges passes droppes sur ce slot. Karim 2026-06-18 :
  // fenetre elargie a 30 jours (au lieu de 2) -> une empreinte mappee tardivement
  // recupere tout son historique recent de presences, pas seulement 48h.
  let recovered = 0;
  try {
    const r = await reingestTuyaWindow({ sinceDays: 30, deviceId: args.tuya_device_id });
    recovered = r.inserted;
  } catch {
    // Non bloquant : le mapping est deja persiste, la re-ingestion peut etre
    // relancee manuellement via /api/cron/tuya-reingest si besoin.
  }
  revalidatePath("/admin/presence");

  return { ok: true, recovered };
}

/**
 * Recupere la liste des users enrôlés sur un terminal (avec leur nom Tuya).
 * Sert a aider l admin a reconnaitre qui pointe.
 */
export async function listTerminalUsersAction(tuya_device_id: string): Promise<{
  ok: boolean;
  error?: string;
  users: Array<{ user_id: string; nick_name: string }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  if (!tuya_device_id) return { ok: false, error: "device requis", users: [] };
  try {
    const users = await listDeviceUsers(tuya_device_id);
    return { ok: true, users };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), users: [] };
  }
}

/**
 * Charge les employes actifs (pour le selecteur dans le modal d enrôlement).
 */
export async function listActiveEmployeesAction(): Promise<{
  ok: boolean;
  employees: Array<{ id: string; full_name: string }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  return { ok: true, employees: (data ?? []) as { id: string; full_name: string }[] };
}

/**
 * Lance le polling Tuya en direct (= ce que fera le cron toutes les 5 min).
 * Utile pour : (a) tester avant le cron, (b) backfiller les events historiques
 * apres un mapping pour les faire apparaitre dans /admin/presence.
 */
/**
 * Cree un employe a la volee (minimum requis : nom + site) puis cree le mapping
 * Tuya en une transaction. Utile pour les terminaux Anvers ou autres ou les
 * employes ne sont pas encore dans la base CaftanRH.
 *
 * Champs auto-generes :
 *   - email : tuya-<random>@local.caftanrh (placeholder unique pour respecter
 *     l unique constraint si elle existe ; Karim pourra editer apres)
 *   - status : "active"
 *   - start_date : aujourd hui
 *   - contract_type : "CDI" (default raisonnable, editable)
 *   - weekly_hours : 38 (default temps plein, editable)
 *   - job_title : "À définir"
 */
export async function createEmployeeAndEnrollAction(args: {
  full_name: string;
  site_id: string;
  tuya_device_id: string;
  tuya_user_id: string;
  direction: "in" | "out";
  tuya_name?: string | null;
}): Promise<{ ok: boolean; error?: string; employee_id?: string; recovered?: number }> {
  await requireRole(["admin"]);
  const fullName = args.full_name.trim();
  if (!fullName) return { ok: false, error: "Nom requis" };
  if (!args.site_id) return { ok: false, error: "Site requis" };
  if (!args.tuya_device_id || !args.tuya_user_id) return { ok: false, error: "Device/user_id requis" };
  if (args.direction !== "in" && args.direction !== "out") return { ok: false, error: "Direction invalide" };

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const placeholderEmail = `tuya-${Math.random().toString(36).slice(2, 10)}@local.caftanrh`;

  // 1. Cree l employe
  const { data: empData, error: empErr } = await supabase
    .from("employees")
    .insert({
      email: placeholderEmail,
      full_name: fullName,
      job_title: "À définir",
      contract_type: "CDI",
      weekly_hours: 38,
      start_date: today,
      status: "active",
    })
    .select("id")
    .single();
  if (empErr || !empData) return { ok: false, error: empErr?.message ?? "Création employé échouée" };
  const employeeId = empData.id;

  // 2. Cree le site_assignment
  const { error: assignErr } = await supabase.from("site_assignments").insert({
    employee_id: employeeId,
    site_id: args.site_id,
    start_date: today,
    is_primary: true,
  });
  if (assignErr) {
    // Rollback employee
    await supabase.from("employees").delete().eq("id", employeeId);
    return { ok: false, error: `site_assignment : ${assignErr.message}` };
  }

  // 3. Cree (ou met a jour) le mapping Tuya - upsert sur (device, employee, direction)
  const { error: mapErr } = await supabase.from("tuya_user_mapping").upsert(
    {
      tuya_device_id: args.tuya_device_id,
      tuya_user_id: args.tuya_user_id,
      employee_id: employeeId,
      direction: args.direction,
      tuya_name: args.tuya_name?.trim() || `${fullName} ${args.direction.toUpperCase()}`,
      is_active: true,
    },
    { onConflict: "tuya_device_id,employee_id,direction" },
  );
  if (mapErr) {
    // Note : on ne rollback PAS l employe + assignment ici, ils restent valides
    return { ok: false, error: `mapping : ${mapErr.message}`, employee_id: employeeId };
  }

  revalidatePath("/admin/tuya/logs");
  revalidatePath("/admin/tuya/users");
  revalidatePath("/planning/employees");

  // Re-ingestion best-effort sur 30 jours (recupere l historique recent du slot).
  let recovered = 0;
  try {
    const r = await reingestTuyaWindow({ sinceDays: 30, deviceId: args.tuya_device_id });
    recovered = r.inserted;
  } catch {
    // Non bloquant.
  }
  revalidatePath("/admin/presence");

  return { ok: true, employee_id: employeeId, recovered };
}

export async function runTuyaPollNowAction(args?: { lookbackDays?: number }) {
  await requireRole(["admin"]);
  const { pollTuyaLogs } = await import("@/lib/tuya-poll");
  const forceLookbackMs = args?.lookbackDays
    ? args.lookbackDays * 24 * 60 * 60 * 1000
    : undefined;
  const result = await pollTuyaLogs({ forceLookbackMs });
  revalidatePath("/admin/tuya/logs");
  revalidatePath("/admin/presence");
  return result;
}
