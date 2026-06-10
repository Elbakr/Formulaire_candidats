"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export type RequestKind =
  | "product"
  | "work_item"
  | "time_change"
  | "supplies"
  | "maintenance"
  | "other";

export async function sendRequestAction(input: {
  roomId: string;
  kind: RequestKind;
  title: string;
  body?: string;
  externalRef?: string;
  quantity?: number;
  urgency?: "low" | "normal" | "urgent";
}): Promise<{ ok?: boolean; error?: string; messageId?: string; requestId?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Titre de la demande requis." };
  if (title.length > 200) return { error: "Titre trop long (max 200)." };

  const { profile } = await requireProfile();
  const supabase = await createClient();

  // 1. Crée le message dans le chat (apparaît comme une carte spéciale).
  const kindLabel: Record<RequestKind, string> = {
    product: "🛍 Demande produit",
    work_item: "📋 Tâche",
    time_change: "🕒 Changement horaire",
    supplies: "📦 Matériel",
    maintenance: "🔧 Maintenance",
    other: "💬 Demande",
  };
  const messageBody = `${kindLabel[input.kind]} — ${title}${input.body ? `\n${input.body}` : ""}`;

  const { data: msg, error: msgErr } = await supabase
    .from("chat_messages")
    .insert({
      room_id: input.roomId,
      author_profile_id: profile.id,
      body: messageBody,
      attachments: [
        {
          kind: "chat_request",
          request_kind: input.kind,
          urgency: input.urgency ?? "normal",
        },
      ],
    })
    .select("id")
    .single();
  if (msgErr) return { error: msgErr.message };

  // 2. Crée le row chat_requests lié.
  const { data: req, error: reqErr } = await supabase
    .from("chat_requests")
    .insert({
      source_message_id: msg.id,
      room_id: input.roomId,
      author_profile_id: profile.id,
      kind: input.kind,
      title,
      body: input.body ?? null,
      external_ref: input.externalRef ?? null,
      quantity: input.quantity ?? null,
      urgency: input.urgency ?? "normal",
    })
    .select("id")
    .single();
  if (reqErr) return { error: reqErr.message };

  revalidatePath(`/chat/${input.roomId}`);
  revalidatePath("/requests");
  return { ok: true, messageId: msg.id, requestId: req.id };
}

export async function updateRequestStatusAction(input: {
  requestId: string;
  status: "open" | "in_progress" | "done" | "rejected";
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    status: input.status,
    resolution_note: input.note ?? null,
  };
  if (input.status === "done" || input.status === "rejected") {
    patch.resolved_by = profile.id;
    patch.resolved_at = new Date().toISOString();
  } else {
    patch.resolved_by = null;
    patch.resolved_at = null;
  }
  const { data: req, error } = await supabase
    .from("chat_requests")
    .update(patch)
    .eq("id", input.requestId)
    .select("room_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/chat/${(req as { room_id: string }).room_id}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function sendMessageAction(
  roomId: string,
  body: string,
  replyToId?: string,
): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message vide." };
  if (trimmed.length > 4000) return { error: "Message trop long (max 4000)." };

  const { profile } = await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      author_profile_id: profile.id,
      body: trimmed,
      reply_to_id: replyToId ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Mise à jour de mon last_read_at
  await supabase
    .from("chat_room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("profile_id", profile.id);

  // Push aux autres membres (le n°1 WhatsApp). cf. notifyRoomPush.
  const preview = trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
  await notifyRoomPush({
    roomId,
    authorId: profile.id,
    authorName: profile.full_name ?? "Nouveau message",
    preview,
  });

  revalidatePath(`/chat/${roomId}`);
  revalidatePath(`/chat`);
  return { ok: true, id: data.id };
}

/**
 * Karim 2026-06-10 (chat WhatsApp) : PUSH aux autres membres d'une room a la
 * reception d'un message. On pousse DIRECTEMENT (sendPushToProfiles) SANS creer
 * de ligne `notifications` -> pas de pollution de la cloche (un message != une
 * notif persistante). Le SW supprime l'affichage OS si la conversation est deja
 * ouverte. tag=room -> les messages d'une meme conv se groupent cote OS.
 * Best-effort : n'echoue JAMAIS l'action appelante.
 */
async function notifyRoomPush(opts: {
  roomId: string;
  authorId: string;
  authorName: string;
  preview: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: room }, { data: members }] = await Promise.all([
      admin.from("chat_rooms").select("name, kind").eq("id", opts.roomId).maybeSingle(),
      admin.from("chat_room_members").select("profile_id, is_muted").eq("room_id", opts.roomId),
    ]);
    const recipientIds = ((members ?? []) as Array<{ profile_id: string; is_muted: boolean | null }>)
      .filter((m) => m.profile_id !== opts.authorId && !m.is_muted)
      .map((m) => m.profile_id);
    if (recipientIds.length === 0) return;
    const r = room as { name: string | null; kind: string } | null;
    const title = r?.kind === "dm" || !r?.name ? opts.authorName : `${opts.authorName} · ${r.name}`;
    const { sendPushToProfiles } = await import("@/lib/push-notify");
    await sendPushToProfiles(recipientIds, {
      title,
      body: opts.preview,
      link: `/chat/${opts.roomId}`,
      tag: `chat-${opts.roomId}`,
      priority: "normal",
    });
  } catch (e) {
    console.warn("[chat] push echoue (non bloquant):", (e as Error).message);
  }
}

/**
 * Karim 2026-06-10 (chat WhatsApp) : envoie une PHOTO. Le fichier est deja
 * uploade cote client dans le bucket prive chat-media (chemin <room>/<uuid>).
 * Ici on cree juste le message avec l'attachment image. Acces ulterieur via
 * getChatMediaUrlAction (URL signee, membres seulement).
 */
export async function sendImageMessageAction(
  roomId: string,
  storagePath: string,
  meta?: { width?: number; height?: number; size?: number; caption?: string },
): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const { profile } = await requireProfile();
  if (!storagePath.startsWith(`${roomId}/`)) return { error: "Chemin média invalide." };
  const supabase = await createClient();
  const caption = (meta?.caption ?? "").trim().slice(0, 4000);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      author_profile_id: profile.id,
      body: caption,
      attachments: [
        {
          kind: "image",
          path: storagePath,
          width: meta?.width ?? null,
          height: meta?.height ?? null,
          size: meta?.size ?? null,
        },
      ],
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("chat_room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("profile_id", profile.id);

  await notifyRoomPush({
    roomId,
    authorId: profile.id,
    authorName: profile.full_name ?? "Nouveau message",
    preview: caption ? `📷 ${caption}` : "📷 Photo",
  });

  revalidatePath(`/chat/${roomId}`);
  revalidatePath(`/chat`);
  return { ok: true, id: data.id };
}

/**
 * Genere une URL signee (1h) pour une photo du chat. Verifie que l'appelant
 * est bien membre de la room (1er segment du chemin) avant de signer.
 */
export async function getChatMediaUrlAction(
  storagePath: string,
): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const { profile } = await requireProfile();
  const roomId = storagePath.split("/")[0];
  if (!roomId) return { error: "Chemin invalide." };
  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("chat_room_members")
    .select("profile_id")
    .eq("room_id", roomId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!mem) return { error: "Accès refusé." };
  const { data: signed, error } = await admin.storage
    .from("chat-media")
    .createSignedUrl(storagePath, 3600);
  if (error || !signed) return { error: error?.message ?? "URL indisponible." };
  return { ok: true, url: signed.signedUrl };
}

export async function markRoomReadAction(roomId: string) {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("chat_room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("profile_id", profile.id);
  revalidatePath("/chat");
  return { ok: true };
}

export async function createDmAction(otherProfileId: string): Promise<{
  ok?: boolean;
  error?: string;
  roomId?: string;
}> {
  const { profile } = await requireProfile();
  if (otherProfileId === profile.id) return { error: "DM avec soi-même impossible." };
  const supabase = await createClient();

  // Cherche un DM existant entre les 2 profils.
  const { data: rooms } = await supabase
    .from("chat_rooms")
    .select("id, members:chat_room_members(profile_id)")
    .eq("kind", "dm");
  type R = { id: string; members: { profile_id: string }[] };
  const existing = ((rooms ?? []) as unknown as R[]).find((r) => {
    const ids = new Set(r.members.map((m) => m.profile_id));
    return ids.size === 2 && ids.has(profile.id) && ids.has(otherProfileId);
  });
  if (existing) return { ok: true, roomId: existing.id };

  // Récupère le nom de l'autre pour nommer la room.
  const { data: other } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", otherProfileId)
    .maybeSingle();
  if (!other) return { error: "Profil introuvable." };

  const { data: created, error } = await supabase
    .from("chat_rooms")
    .insert({
      kind: "dm",
      name: `${profile.full_name ?? "Moi"} ↔ ${other.full_name ?? "?"}`,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("chat_room_members").insert([
    { room_id: created.id, profile_id: profile.id, role: "admin" },
    { room_id: created.id, profile_id: otherProfileId, role: "member" },
  ]);

  revalidatePath("/chat");
  return { ok: true, roomId: created.id };
}

export async function createGroupAction(
  name: string,
  memberIds: string[],
): Promise<{ ok?: boolean; error?: string; roomId?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom de groupe requis." };
  if (memberIds.length === 0) return { error: "Au moins 1 membre requis." };
  const { profile } = await requireProfile();
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("chat_rooms")
    .insert({
      kind: "custom_group",
      name: trimmed,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const ids = new Set([profile.id, ...memberIds]);
  await supabase.from("chat_room_members").insert(
    [...ids].map((pid) => ({
      room_id: created.id,
      profile_id: pid,
      role: pid === profile.id ? "admin" : "member",
    })),
  );

  revalidatePath("/chat");
  return { ok: true, roomId: created.id };
}
