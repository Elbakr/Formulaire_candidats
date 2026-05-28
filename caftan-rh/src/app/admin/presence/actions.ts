"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatDurationMin } from "@/lib/clock";

const SELFIE_BUCKET = "clock-selfies";
const SELFIE_SIGNED_URL_TTL_S = 60; // 1 minute, suffisant pour ouvrir la modale.

/**
 * Génère une signed URL courte (60s) pour visualiser un selfie de pointage.
 * Réservé RH/manager/admin. Renvoie null si le path est vide ou inaccessible.
 */
export async function getSelfieSignedUrlAction(
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!storagePath || typeof storagePath !== "string") {
    return { error: "Chemin invalide." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SELFIE_BUCKET)
    .createSignedUrl(storagePath, SELFIE_SIGNED_URL_TTL_S);
  if (error) return { error: error.message };
  return { url: data?.signedUrl };
}

/**
 * Override manager : insère manuellement un clock-in ou clock-out
 * (corrige les oublis). Diffuse aussi le message dans le chat de site.
 */
export async function managerOverrideClockAction(args: {
  employeeId: string;
  action: "in" | "out";
  timestamp: string; // ISO
  reason: string;
  siteId?: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  if (!args.timestamp) return { error: "Timestamp manquant." };
  const ts = new Date(args.timestamp);
  if (Number.isNaN(ts.getTime())) return { error: "Timestamp invalide." };

  // Récupère l'employé pour le nom et son profile_id
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, profile_id")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employé introuvable." };
  const employee = emp as { id: string; full_name: string; profile_id: string | null };

  // Détermine le site : args.siteId, sinon site du dernier clock_in_at, sinon assignment principal
  let siteId: string | null = args.siteId ?? null;
  let shiftId: string | null = null;
  if (!siteId) {
    const { data: lastIn } = await supabase
      .from("clock_entries")
      .select("site_id, shift_id")
      .eq("employee_id", employee.id)
      .eq("kind", "in")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastIn) {
      siteId = (lastIn as { site_id: string | null }).site_id;
      shiftId = (lastIn as { shift_id: string | null }).shift_id;
    }
  }

  let siteCode: string | null = null;
  if (siteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("code")
      .eq("id", siteId)
      .maybeSingle();
    siteCode = (site as { code: string } | null)?.code ?? null;
  }

  const note = args.reason
    ? `[Override par ${profile.full_name ?? "manager"}] ${args.reason}`
    : `[Override par ${profile.full_name ?? "manager"}]`;

  const { error } = await supabase.from("clock_entries").insert({
    employee_id: employee.id,
    site_id: siteId,
    shift_id: shiftId,
    kind: args.action,
    occurred_at: ts.toISOString(),
    entry_method: "manager_override",
    source: "manual_admin",
    notes: note,
  });
  if (error) return { error: error.message };

  // Broadcast (si on a un site_group + un profile_id)
  if (siteId && employee.profile_id) {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", siteId)
      .maybeSingle();
    if (room) {
      const time = ts.toLocaleTimeString("fr-BE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const verb = args.action === "in" ? "Arrivée corrigée" : "Départ corrigé";
      const icon = args.action === "in" ? "\u{1F4CD}" : "\u{1F6AA}";
      await supabase.from("chat_messages").insert({
        room_id: (room as { id: string }).id,
        author_profile_id: employee.profile_id,
        body: `${icon} ${verb} — ${employee.full_name} à ${time}`,
        attachments: [
          {
            kind: "presence_event",
            action: args.action,
            site_code: siteCode,
            override: true,
          },
        ],
      });
    }
  }

  revalidatePath("/admin/presence");
  revalidatePath("/me/clock");
  if (siteCode) revalidatePath(`/planning/sites/${siteCode}`);
  return { ok: true };
}

/** Force le clock-out de quelqu'un (cas oubli — alias plus simple). */
export async function forceClockOutAction(args: {
  employeeId: string;
  reason?: string;
}): Promise<{ ok?: true; error?: string; durationMin?: number }> {
  const r = await managerOverrideClockAction({
    employeeId: args.employeeId,
    action: "out",
    timestamp: new Date().toISOString(),
    reason: args.reason ?? "Force clock-out (oubli)",
  });
  if (r.error) return r;
  return { ok: true };
}

/**
 * Karim 2026-05-25 : corrige le site d un pointage actuel. Utile quand le
 * terminal Pointage A est partage par sites A/B/D (proximite) et que la
 * detection auto via shift_id du jour a faux. Met a jour le site_id du
 * dernier clock_in non encore ferme (et de l OUT correspondant s il existe).
 */
export async function updateClockEntrySiteAction(args: {
  employeeId: string;
  newSiteId: string;
}): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!args.newSiteId) return { error: "Site requis." };
  const supabase = await createClient();
  // Cherche le dernier IN ouvert (sans OUT posterieur)
  const { data: lastIn } = await supabase
    .from("clock_entries")
    .select("id, occurred_at, shift_id")
    .eq("employee_id", args.employeeId)
    .eq("kind", "in")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastIn) return { error: "Aucun pointage IN trouvé." };
  const inRow = lastIn as { id: string; occurred_at: string; shift_id: string | null };
  const { error: upInErr } = await supabase
    .from("clock_entries")
    .update({ site_id: args.newSiteId, notes: `Site corrigé manuellement le ${new Date().toISOString().slice(0,10)}` })
    .eq("id", inRow.id);
  if (upInErr) return { error: upInErr.message };
  // Update aussi l OUT correspondant si existe (meme employee, occurred_at apres, meme jour)
  const today = inRow.occurred_at.slice(0, 10);
  const { data: outRow } = await supabase
    .from("clock_entries")
    .select("id")
    .eq("employee_id", args.employeeId)
    .eq("kind", "out")
    .gt("occurred_at", inRow.occurred_at)
    .lte("occurred_at", `${today}T23:59:59`)
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (outRow) {
    await supabase
      .from("clock_entries")
      .update({ site_id: args.newSiteId })
      .eq("id", (outRow as { id: string }).id);
  }
  revalidatePath("/admin/presence");
  revalidatePath("/planning/employees");
  return { ok: true };
}

export { formatDurationMin };
