"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { pickDefaultSiteId, formatDurationMin } from "@/lib/clock";
import { haversineKm } from "@/lib/distance";

type Geo = { lat: number; lng: number; accuracy?: number } | null;

/**
 * Vérifie qu'un point GPS est dans le rayon (mètres) autour d'un site.
 * Renvoie { ok, distance_m } — `distance_m` est `null` si on ne peut pas
 * calculer (site sans coords, par ex.).
 */
function checkGeofence(
  geo: Geo,
  site: { lat: number | null; lng: number | null; geofence_radius_m: number | null } | null,
): { ok: boolean; distance_m: number | null; radius_m: number | null } {
  if (!geo || !site || site.lat == null || site.lng == null) {
    return { ok: true, distance_m: null, radius_m: site?.geofence_radius_m ?? null };
  }
  const km = haversineKm(
    { lat: geo.lat, lng: geo.lng },
    { lat: Number(site.lat), lng: Number(site.lng) },
  );
  const distance_m = Math.round(km * 1000);
  const radius_m = site.geofence_radius_m ?? 100;
  return { ok: distance_m <= radius_m, distance_m, radius_m };
}

/** Insert un message système "présence" dans le chat de site (best-effort). */
async function broadcastPresence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    siteId: string | null;
    profileId: string | null;
    action: "in" | "out";
    employeeName: string;
    siteCode: string | null;
    durationMin?: number;
    occurredAt: string;
  },
) {
  if (!args.siteId || !args.profileId) return;
  const { data: room } = await supabase
    .from("chat_rooms")
    .select("id")
    .eq("kind", "site_group")
    .eq("site_id", args.siteId)
    .maybeSingle();
  if (!room) return;
  const time = new Date(args.occurredAt).toLocaleTimeString("fr-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  let body: string;
  if (args.action === "in") {
    body = `\u{1F4CD} Arrivée — ${args.employeeName} a clocké-in à ${time}`;
  } else {
    const dur = typeof args.durationMin === "number"
      ? ` · ${formatDurationMin(args.durationMin)}`
      : "";
    const short = typeof args.durationMin === "number" && args.durationMin < 240
      ? " (courte journée)" : "";
    body = `\u{1F6AA} Départ — ${args.employeeName} a clocké-out à ${time}${dur}${short}`;
  }
  await supabase.from("chat_messages").insert({
    room_id: room.id,
    author_profile_id: args.profileId,
    body,
    attachments: [
      {
        kind: "presence_event",
        action: args.action,
        site_code: args.siteCode,
        duration_min: args.durationMin ?? null,
      },
    ],
  });
}

export async function clockInAction(args: {
  siteId?: string | null;
  geo?: Geo;
  /** Chemin Supabase Storage de la photo selfie (bucket clock-selfies). */
  selfieStoragePath?: string | null;
  /** Si l'upload selfie a échoué côté client : raison + on flag is_anomalous. */
  selfieFailureReason?: string | null;
}): Promise<{ ok?: true; error?: string; siteId?: string | null; distance_m?: number | null }> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!emp) return { error: "Employé non identifié." };

  // Détermine le site et le shift
  const def = await pickDefaultSiteId((emp as { id: string }).id);
  const siteId = args.siteId ?? def.siteId;
  const shiftId = def.shiftId;
  const method = def.source === "shift_today" ? "auto_shift" : "tap";

  // Récupère métadonnées site (code + geofence) en un seul call.
  let siteCode: string | null = null;
  let siteGeo: { lat: number | null; lng: number | null; geofence_radius_m: number | null } | null = null;
  if (siteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("code, lat, lng, geofence_radius_m")
      .eq("id", siteId)
      .maybeSingle();
    if (site) {
      const s = site as {
        code: string;
        lat: number | null;
        lng: number | null;
        geofence_radius_m: number | null;
      };
      siteCode = s.code;
      siteGeo = {
        lat: s.lat,
        lng: s.lng,
        geofence_radius_m: s.geofence_radius_m,
      };
    }
  }

  // Charge le toggle global geofence strict + selfie required.
  const { data: orgRow } = await supabase
    .from("org_settings")
    .select("clock_geofence_strict, clock_require_selfie, clock_selfie_keep_days")
    .eq("id", 1)
    .maybeSingle();
  const orgRowTyped = (orgRow as {
    clock_geofence_strict?: boolean | null;
    clock_require_selfie?: boolean | null;
    clock_selfie_keep_days?: number | null;
  } | null) ?? null;
  const geofenceStrict = orgRowTyped?.clock_geofence_strict !== false;
  const selfieRequired = orgRowTyped?.clock_require_selfie !== false;
  const selfieKeepDays = orgRowTyped?.clock_selfie_keep_days ?? 30;

  // === Géofence strict (Module 4) ============================================
  // Si strict=true ET site a coords : on contrôle.
  // Si strict=true ET pas de geo fournie ET site a coords → refus.
  // Si strict=false → on capture mais on ne bloque pas, tag is_anomalous si hors.
  let isAnomalous = false;
  let anomalyNote: string | null = null;
  let computedDistanceM: number | null = null;

  if (geofenceStrict && siteGeo && siteGeo.lat != null && siteGeo.lng != null) {
    if (!args.geo) {
      return {
        error:
          "Géolocalisation requise pour pointer. Active la géoloc dans ton navigateur.",
      };
    }
    const fence = checkGeofence(args.geo, siteGeo);
    computedDistanceM = fence.distance_m;
    if (!fence.ok) {
      const d = fence.distance_m ?? "?";
      const r = fence.radius_m ?? 100;
      return {
        error: `Pointage refusé : tu es à ${d} m du site (limite ${r} m). Rapproche-toi du magasin.`,
        distance_m: fence.distance_m ?? null,
      };
    }
  } else if (siteGeo && args.geo) {
    // Mode non strict : on calcule pour info + tag anomaly si dehors.
    const fence = checkGeofence(args.geo, siteGeo);
    computedDistanceM = fence.distance_m;
    if (!fence.ok) {
      isAnomalous = true;
      anomalyNote = `hors géofence: ${fence.distance_m}m > ${fence.radius_m}m`;
    }
  }

  // === Selfie échec côté client ============================================
  if (args.selfieFailureReason && !args.selfieStoragePath) {
    isAnomalous = true;
    const reason = String(args.selfieFailureReason).slice(0, 200);
    anomalyNote = anomalyNote
      ? `${anomalyNote} | selfie failed: ${reason}`
      : `selfie failed: ${reason}`;
  }

  // === Selfie purge (RGPD) =================================================
  let selfiePurgeAfter: string | null = null;
  if (args.selfieStoragePath) {
    const ts = new Date(Date.now() + selfieKeepDays * 86_400_000).toISOString();
    selfiePurgeAfter = ts;
  }

  // Si selfie est requis mais pas fourni ET pas de raison d'échec → on ne
  // bloque PAS (le client a peut-être un vieux navigateur sans getUserMedia).
  // On tag juste l'anomalie pour audit RH.
  if (selfieRequired && !args.selfieStoragePath && !args.selfieFailureReason) {
    isAnomalous = true;
    anomalyNote = anomalyNote
      ? `${anomalyNote} | selfie missing (no client capture)`
      : "selfie missing (no client capture)";
  }

  const occurredAt = new Date().toISOString();
  const { error } = await supabase.from("clock_entries").insert({
    employee_id: (emp as { id: string }).id,
    shift_id: shiftId,
    site_id: siteId,
    kind: "in",
    occurred_at: occurredAt,
    entry_method: method,
    source: "web",
    geo_lat: args.geo?.lat ?? null,
    geo_lng: args.geo?.lng ?? null,
    geo_accuracy_m: args.geo?.accuracy ?? null,
    is_anomalous: isAnomalous,
    notes: anomalyNote,
    selfie_storage_path: args.selfieStoragePath ?? null,
    selfie_purge_after: selfiePurgeAfter,
  });
  if (error) return { error: error.message };

  await broadcastPresence(supabase, {
    siteId: siteId ?? null,
    profileId: profile.id,
    action: "in",
    employeeName: (emp as { full_name: string }).full_name,
    siteCode,
    occurredAt,
  });

  revalidatePath("/me/clock");
  revalidatePath("/admin/presence");
  revalidatePath("/chat");
  if (siteCode) revalidatePath(`/planning/sites/${siteCode}`);
  return { ok: true, siteId: siteId ?? null, distance_m: computedDistanceM };
}

export async function clockOutAction(args: {
  geo?: Geo;
}): Promise<{ ok?: true; error?: string }> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!emp) return { error: "Employé non identifié." };

  // Trouve la dernière entrée pour récupérer le site et la durée
  const { data: lastIn } = await supabase
    .from("clock_entries")
    .select("id, kind, occurred_at, site_id, shift_id")
    .eq("employee_id", (emp as { id: string }).id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastIn || (lastIn as { kind: string }).kind !== "in") {
    return { error: "Aucun pointage en cours." };
  }
  const last = lastIn as { id: string; occurred_at: string; site_id: string | null; shift_id: string | null };

  let siteCode: string | null = null;
  if (last.site_id) {
    const { data: site } = await supabase
      .from("sites")
      .select("code")
      .eq("id", last.site_id)
      .maybeSingle();
    siteCode = (site as { code: string } | null)?.code ?? null;
  }

  const occurredAt = new Date().toISOString();
  const { error } = await supabase.from("clock_entries").insert({
    employee_id: (emp as { id: string }).id,
    shift_id: last.shift_id,
    site_id: last.site_id,
    kind: "out",
    occurred_at: occurredAt,
    entry_method: "tap",
    source: "web",
    geo_lat: args.geo?.lat ?? null,
    geo_lng: args.geo?.lng ?? null,
    geo_accuracy_m: args.geo?.accuracy ?? null,
  });
  if (error) return { error: error.message };

  // Marquer le shift comme done
  if (last.shift_id) {
    await supabase.from("shifts").update({ status: "done" }).eq("id", last.shift_id);
  }

  const durationMin =
    (new Date(occurredAt).getTime() - new Date(last.occurred_at).getTime()) / 60000;

  await broadcastPresence(supabase, {
    siteId: last.site_id,
    profileId: profile.id,
    action: "out",
    employeeName: (emp as { full_name: string }).full_name,
    siteCode,
    durationMin,
    occurredAt,
  });

  revalidatePath("/me/clock");
  revalidatePath("/admin/presence");
  revalidatePath("/chat");
  if (siteCode) revalidatePath(`/planning/sites/${siteCode}`);
  return { ok: true };
}

/** Compat: ancienne signature utilisée par d'autres composants éventuels. */
export async function clockAction(args: {
  employeeId: string;
  kind: "in" | "out";
  shiftId: string | null;
}): Promise<{ ok?: true; error?: string }> {
  if (args.kind === "in") {
    const r = await clockInAction({});
    return r.ok ? { ok: true } : { error: r.error };
  }
  return clockOutAction({});
}
