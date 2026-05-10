import { createClient } from "@/lib/supabase/server";

export type ChatRoom = {
  id: string;
  kind: "site_group" | "dm" | "custom_group";
  name: string;
  description: string | null;
  site_id: string | null;
  is_archived: boolean;
  created_at: string;
  site: { code: string; name: string; color: string | null } | null;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  author_profile_id: string | null;
  body: string;
  attachments: unknown[];
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type RoomMember = {
  room_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
};

/** Charge les rooms dont l'utilisateur est membre (RLS filtre déjà). */
export async function loadMyRooms(): Promise<
  Array<ChatRoom & { unread: number; last_message: ChatMessage | null; member: RoomMember | null }>
> {
  const supabase = await createClient();
  const { data: roomsRaw } = await supabase
    .from("chat_rooms")
    .select(
      `id, kind, name, description, site_id, is_archived, created_at,
       site:sites(code, name, color)`,
    )
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  const rooms = (roomsRaw ?? []) as unknown as ChatRoom[];
  if (rooms.length === 0) return [];

  const roomIds = rooms.map((r) => r.id);
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;

  // Membership rows (mine).
  const { data: members } = me
    ? await supabase
        .from("chat_room_members")
        .select("*")
        .eq("profile_id", me)
        .in("room_id", roomIds)
    : { data: [] };
  const memberByRoom = new Map<string, RoomMember>();
  for (const m of (members ?? []) as RoomMember[]) memberByRoom.set(m.room_id, m);

  // Last message per room (one query — newest first then group).
  const { data: msgsRaw } = await supabase
    .from("chat_messages")
    .select("*")
    .in("room_id", roomIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const msgs = (msgsRaw ?? []) as ChatMessage[];
  const lastByRoom = new Map<string, ChatMessage>();
  for (const m of msgs) {
    if (!lastByRoom.has(m.room_id)) lastByRoom.set(m.room_id, m);
  }

  return rooms.map((r) => {
    const member = memberByRoom.get(r.id) ?? null;
    const last = lastByRoom.get(r.id) ?? null;
    let unread = 0;
    if (member?.last_read_at) {
      unread = msgs.filter(
        (m) => m.room_id === r.id && m.created_at > (member.last_read_at ?? ""),
      ).length;
    } else if (last) {
      unread = msgs.filter((m) => m.room_id === r.id).length;
    }
    return { ...r, member, last_message: last, unread };
  });
}
