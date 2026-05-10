"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { buildPlanningRecap } from "@/lib/planning-recap";
import {
  getTwilioClient,
  normalizePhoneE164,
  toWhatsAppAddress,
} from "@/lib/whatsapp/client";
import { logActivity } from "@/lib/activity";

/**
 * Charge le récap planning d'un employé et l'envoie par DM Chat. Si la room
 * DM n'existe pas encore, elle est créée. Renvoie le `roomId` pour que le
 * client puisse rediriger vers `/chat/{roomId}`.
 */
export async function sharePlanningViaDmAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{ ok?: boolean; roomId?: string; error?: string; messagePreview?: string }> {
  const { profile } = await requireProfile();
  const supabase = await createClient();

  // Résolution profile_id de l'employé
  const { data: emp } = await supabase
    .from("employees")
    .select("profile_id, full_name")
    .eq("id", args.employeeId)
    .maybeSingle();
  const e = emp as unknown as { profile_id: string | null; full_name: string } | null;
  if (!e) return { error: "Employé introuvable." };
  if (!e.profile_id) return { error: "Cet employé n'a pas de compte messagerie." };
  if (e.profile_id === profile.id) {
    return { error: "DM avec soi-même impossible — utilise plutôt l'email ou l'impression." };
  }

  // Récap — DM vers l'employé : on FORCE audience='employee' pour ne JAMAIS
  // exposer les heures sup côté employé (règle Karim 2026-05-11).
  const recap = await buildPlanningRecap(args.employeeId, args.weekISO, "employee");
  if (recap.error || !recap.ok) return { error: recap.error ?? "Récap indisponible." };

  // Cherche un DM existant entre les 2 profils
  const { data: rooms } = await supabase
    .from("chat_rooms")
    .select("id, members:chat_room_members(profile_id)")
    .eq("kind", "dm");
  type R = { id: string; members: { profile_id: string }[] };
  const existing = ((rooms ?? []) as unknown as R[]).find((r) => {
    const ids = new Set(r.members.map((m) => m.profile_id));
    return ids.size === 2 && ids.has(profile.id) && ids.has(e.profile_id!);
  });

  let roomId: string | null = existing?.id ?? null;
  if (!roomId) {
    // Récupère le nom de l'autre pour nommer la room
    const { data: other } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", e.profile_id)
      .maybeSingle();
    if (!other) return { error: "Profil introuvable." };

    const { data: created, error: roomErr } = await supabase
      .from("chat_rooms")
      .insert({
        kind: "dm",
        name: `${profile.full_name ?? "Moi"} ↔ ${(other as { full_name: string }).full_name ?? "?"}`,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (roomErr || !created) return { error: roomErr?.message ?? "Création DM impossible." };
    roomId = (created as { id: string }).id;

    await supabase.from("chat_room_members").insert([
      { room_id: roomId, profile_id: profile.id, role: "admin" },
      { room_id: roomId, profile_id: e.profile_id, role: "member" },
    ]);
  }

  const body = `📅 ${recap.ok.text}`;
  const { error: msgErr } = await supabase.from("chat_messages").insert({
    room_id: roomId,
    author_profile_id: profile.id,
    body,
  });
  if (msgErr) return { error: msgErr.message };

  return { ok: true, roomId, messagePreview: body.slice(0, 140) };
}

/**
 * Envoie le récap planning d'un employé via WhatsApp. Wrappe la mécanique
 * Twilio existante mais en partant de l'`employees.id` (pas d'application_id
 * requis). N'effectue pas la compliance check 24h-window car c'est un message
 * RH professionnel à un employé — l'opt-in est implicite par le contrat.
 */
export async function sendWhatsAppToEmployeeAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{ ok?: boolean; sid?: string; recipient?: string; error?: string }> {
  const { profile } = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "rh" && profile.role !== "manager") {
    // Auto-share : un employé peut s'envoyer son propre planning à lui-même
    // mais on ne va PAS l'envoyer par WhatsApp en self (pas pertinent).
    return { error: "Action réservée aux managers / RH / admins." };
  }

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, phone")
    .eq("id", args.employeeId)
    .maybeSingle();
  const e = emp as unknown as { id: string; full_name: string; phone: string | null } | null;
  if (!e) return { error: "Employé introuvable." };
  if (!e.phone) return { error: "Numéro de téléphone manquant pour cet employé." };

  const phone = normalizePhoneE164(e.phone);
  if (!phone) return { error: "Numéro de téléphone invalide." };

  // WhatsApp vers l'employé : audience='employee' forcée (pas d'OT).
  const recap = await buildPlanningRecap(args.employeeId, args.weekISO, "employee");
  if (recap.error || !recap.ok) return { error: recap.error ?? "Récap indisponible." };

  const bundle = await getTwilioClient();
  if (!bundle) {
    return {
      error:
        "WhatsApp non configuré ou désactivé. Configure-le dans /admin/integrations/whatsapp.",
    };
  }

  const fromAddress = bundle.fromNumber.startsWith("whatsapp:")
    ? bundle.fromNumber
    : `whatsapp:${bundle.fromNumber}`;
  const toAddress = toWhatsAppAddress(phone);
  const body = `📅 ${recap.ok.text}`;

  let sid: string | undefined;
  try {
    const created = await bundle.client.messages.create({
      from: fromAddress,
      to: toAddress,
      body,
    });
    sid = created.sid;
  } catch (ex) {
    const msg = ex instanceof Error ? ex.message : "Erreur Twilio inconnue";
    console.error("[whatsapp] employee send failed:", msg);
    return { error: `Échec de l'envoi : ${msg}` };
  }

  const admin = createAdminClient();
  await admin
    .from("whatsapp_settings")
    .update({ last_send_at: new Date().toISOString() })
    .eq("id", 1);

  await logActivity({
    kind: "whatsapp.sent",
    targetType: "employee",
    targetId: args.employeeId,
    description: `WhatsApp planning envoyé à ${e.full_name}`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: {
      provider: "whatsapp.twilio",
      to_phone: phone,
      sid: sid ?? null,
      mode: "freeform",
      kind: "planning_share",
    },
  });

  return { ok: true, sid, recipient: phone };
}

/**
 * Charge juste le récap pour l'afficher dans le dialog côté client.
 * Utilisé par les modes "Email" (envoyé par EmailJS browser-side) et
 * "Imprimer" (côté client).
 *
 * L'audience est TOUJOURS 'employee' pour ce point d'entrée — l'email/DM/
 * WhatsApp partent vers l'employé donc ne doivent JAMAIS contenir d'OT.
 * Pour la vue admin avec OT, voir les pages d'impression `?audience=admin`.
 */
export async function getPlanningRecapAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  text?: string;
  weekLabel?: string;
  totalHours?: number;
  shiftsCount?: number;
  employeeName?: string;
  employeeEmail?: string | null;
  hasPhone?: boolean;
  hasProfile?: boolean;
  /** Nombre de shifts OT cachés à l'employé sur la période — informatif. */
  overtimeOmitted?: number;
  error?: string;
}> {
  await requireProfile();
  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, email, phone, profile_id")
    .eq("id", args.employeeId)
    .maybeSingle();
  const e = emp as unknown as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    profile_id: string | null;
  } | null;
  if (!e) return { error: "Employé introuvable." };

  const recap = await buildPlanningRecap(args.employeeId, args.weekISO, "employee");
  if (recap.error || !recap.ok) return { error: recap.error ?? "Récap indisponible." };

  return {
    ok: true,
    text: recap.ok.text,
    weekLabel: recap.ok.weekLabel,
    totalHours: recap.ok.totalHours,
    shiftsCount: recap.ok.shiftsCount,
    employeeName: e.full_name,
    employeeEmail: e.email ?? null,
    hasPhone: !!e.phone,
    hasProfile: !!e.profile_id,
    overtimeOmitted: recap.ok.overtimeOmitted,
  };
}
