"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export type BroadcastAudienceKind =
  | "all_sites"
  | "specific_sites"
  | "role_managers"
  | "role_employees";

export type BroadcastPriority = "normal" | "important" | "urgent";

type SendBroadcastInput = {
  title: string;
  body: string;
  audienceKind: BroadcastAudienceKind;
  audienceSiteIds?: string[]; // pour specific_sites
  priority: BroadcastPriority;
  sendChat: boolean;
  sendEmail: boolean;
  sendWhatsapp: boolean;
};

type SendBroadcastResult = {
  ok?: boolean;
  error?: string;
  broadcastId?: string;
  chatRoomsPosted?: number;
  emailRecipients?: number;
  whatsappSkipped?: boolean;
  warning?: string;
};

export type BroadcastEmailRecipient = { email: string; name: string };
export type BroadcastEmailPayload = {
  recipients: BroadcastEmailRecipient[];
  subject: string;
  body: string;
  broadcast_id: string;
};

/**
 * Envoie une annonce broadcast :
 * 1. Insère dans `broadcasts`.
 * 2. Si sendChat → poste un message dans chaque chat_room cible
 *    (avec attachments[0]={kind:'broadcast', priority, broadcast_id}).
 * 3. Si sendEmail → renvoie la liste des destinataires (l'envoi se fait
 *    côté client via EmailJS).
 * 4. WhatsApp : V1 skip + warning (compliance opt-in/window non triviale).
 */
export async function sendBroadcastAction(
  input: SendBroadcastInput,
): Promise<SendBroadcastResult & { emailPayload?: BroadcastEmailPayload }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "Titre requis." };
  if (!body) return { error: "Message requis." };
  if (title.length > 200) return { error: "Titre trop long (max 200)." };
  if (body.length > 8000) return { error: "Message trop long (max 8000)." };

  if (
    !input.sendChat &&
    !input.sendEmail &&
    !input.sendWhatsapp
  ) {
    return { error: "Sélectionne au moins un canal." };
  }

  if (input.audienceKind === "specific_sites") {
    if (!input.audienceSiteIds || input.audienceSiteIds.length === 0) {
      return { error: "Sélectionne au moins un site." };
    }
  }

  // 1. Insert broadcast row.
  const { data: bc, error: bcErr } = await supabase
    .from("broadcasts")
    .insert({
      author_profile_id: profile.id,
      title,
      body,
      audience_kind: input.audienceKind,
      audience_site_ids:
        input.audienceKind === "specific_sites"
          ? input.audienceSiteIds ?? []
          : null,
      priority: input.priority,
      send_chat: input.sendChat,
      send_email: input.sendEmail,
      send_whatsapp: input.sendWhatsapp,
    })
    .select("id")
    .single();
  if (bcErr || !bc) return { error: bcErr?.message ?? "Insertion échouée." };
  const broadcastId = (bc as { id: string }).id;

  let chatRoomsPosted = 0;
  let warnings: string[] = [];

  // 2. Chat — poste dans les site_groups concernés.
  if (input.sendChat) {
    let roomsToPost: string[] = [];

    if (
      input.audienceKind === "all_sites" ||
      input.audienceKind === "role_employees" ||
      input.audienceKind === "role_managers"
    ) {
      // Tous les site_groups (les 6 sites A→F).
      const { data: rooms } = await supabase
        .from("chat_rooms")
        .select("id")
        .eq("kind", "site_group")
        .eq("is_archived", false);
      roomsToPost = ((rooms ?? []) as Array<{ id: string }>).map((r) => r.id);
    } else if (input.audienceKind === "specific_sites") {
      const { data: rooms } = await supabase
        .from("chat_rooms")
        .select("id")
        .eq("kind", "site_group")
        .in("site_id", input.audienceSiteIds ?? []);
      roomsToPost = ((rooms ?? []) as Array<{ id: string }>).map((r) => r.id);
    }

    const messageBody = `📢 ${title}\n\n${body}`;
    const attachment = {
      kind: "broadcast",
      priority: input.priority,
      broadcast_id: broadcastId,
      audience: input.audienceKind,
    };

    for (const roomId of roomsToPost) {
      const { error: msgErr } = await supabase.from("chat_messages").insert({
        room_id: roomId,
        author_profile_id: profile.id,
        body: messageBody,
        attachments: [attachment],
      });
      if (!msgErr) chatRoomsPosted++;
    }

    if (chatRoomsPosted === 0 && roomsToPost.length > 0) {
      warnings.push(
        "Aucun message chat n'a pu être posté (vérifie les site_groups).",
      );
    }
    if (roomsToPost.length === 0) {
      warnings.push(
        "Aucun site_group trouvé pour cette audience — message chat non posté.",
      );
    }
  }

  // 3. Email — collecte les destinataires (l'envoi se fait côté client EmailJS).
  let emailRecipients: BroadcastEmailRecipient[] = [];
  if (input.sendEmail) {
    let query = supabase
      .from("employees")
      .select("id, full_name, email, status")
      .eq("status", "active")
      .not("email", "is", null);

    if (input.audienceKind === "specific_sites") {
      // Filtrer les employés assignés à ces sites.
      const { data: assigns } = await supabase
        .from("site_assignments")
        .select("employee_id")
        .in("site_id", input.audienceSiteIds ?? [])
        .or("end_date.is.null,end_date.gte." + new Date().toISOString().slice(0, 10));
      const empIds = Array.from(
        new Set(((assigns ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id)),
      );
      if (empIds.length === 0) {
        emailRecipients = [];
      } else {
        query = query.in("id", empIds);
      }
    }

    if (input.audienceKind === "role_managers" || input.audienceKind === "role_employees") {
      // On filtre via profile.role.
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, role")
        .in("role", input.audienceKind === "role_managers" ? ["manager", "admin", "rh"] : ["employee", "candidate"]);
      const profIds = Array.from(
        new Set(((profs ?? []) as Array<{ id: string }>).map((p) => p.id)),
      );
      if (profIds.length === 0) {
        emailRecipients = [];
      } else {
        query = query.in("profile_id", profIds);
      }
    }

    if (
      !(input.audienceKind === "specific_sites" &&
        (input.audienceSiteIds ?? []).length === 0)
    ) {
      const { data: emps } = await query;
      emailRecipients = ((emps ?? []) as Array<{ full_name: string; email: string | null }>)
        .filter((e) => !!e.email)
        .map((e) => ({ name: e.full_name, email: e.email! }));
    }
  }

  // 4. WhatsApp — V1 : skip avec warning.
  let whatsappSkipped = false;
  if (input.sendWhatsapp) {
    whatsappSkipped = true;
    warnings.push(
      "WhatsApp non envoyé (V1 — la diffusion broadcast WhatsApp doit respecter la compliance opt-in/window 24h ; à activer plus tard depuis /admin/integrations/whatsapp).",
    );
  }

  // Marque l'envoi comme effectué.
  await supabase
    .from("broadcasts")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", broadcastId);

  revalidatePath("/admin/broadcasts");
  const emailPayload: BroadcastEmailPayload | undefined = input.sendEmail
    ? {
        recipients: emailRecipients,
        subject: title,
        body,
        broadcast_id: broadcastId,
      }
    : undefined;

  return {
    ok: true,
    broadcastId,
    chatRoomsPosted,
    emailRecipients: emailRecipients.length,
    whatsappSkipped,
    warning: warnings.length > 0 ? warnings.join(" • ") : undefined,
    emailPayload,
  };
}

/**
 * Marque le nombre d'emails effectivement envoyés via EmailJS browser-side.
 * Idempotent : on écrase `email_sent_count` à chaque appel.
 */
export async function markBroadcastEmailSentAction(
  broadcastId: string,
  sentCount: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const count = Math.max(0, Math.floor(sentCount));
  const { error } = await supabase
    .from("broadcasts")
    .update({ email_sent_count: count, email_sent_at: new Date().toISOString() })
    .eq("id", broadcastId);
  if (error) {
    // Tolérant : si la colonne n'existe pas encore (migration non passée), on ne casse pas l'UX.
    if (/column.*email_sent_count|email_sent_at/i.test(error.message)) {
      return { ok: true };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/broadcasts");
  return { ok: true };
}

export async function deleteBroadcastAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("broadcasts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/broadcasts");
  return { ok: true };
}
