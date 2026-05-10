import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import { ArrowLeft, Hash, Users, MessageSquare } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "./thread";
import { Composer } from "./composer";
import { ChatPresenceBar } from "./presence-bar";
import { loadCurrentlyIn } from "@/lib/clock";

type Room = {
  id: string;
  kind: "site_group" | "dm" | "custom_group";
  name: string;
  description: string | null;
  site_id: string | null;
  site: { code: string; name: string; color: string | null } | null;
};

type Message = {
  id: string;
  room_id: string;
  author_profile_id: string | null;
  body: string;
  attachments: Array<{ kind?: string; action?: string; site_code?: string; duration_min?: number | null }> | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: { id: string; full_name: string | null; role: string | null } | null;
};

type Member = {
  profile_id: string;
  role: string;
  profile: { id: string; full_name: string | null; role: string | null } | null;
};

export default async function ChatRoomPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireProfile();
  const { id } = await props.params;

  const supabase = await createClient();
  const [
    { data: roomRaw },
    { data: msgsRaw },
    { data: memsRaw },
    { data: requestsRaw },
  ] = await Promise.all([
    supabase
      .from("chat_rooms")
      .select(
        `id, kind, name, description, site_id,
         site:sites(code, name, color)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("chat_messages")
      .select(
        `id, room_id, author_profile_id, body, attachments, reply_to_id, created_at,
         edited_at, deleted_at,
         author:profiles!author_profile_id(id, full_name, role)`,
      )
      .eq("room_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("chat_room_members")
      .select(
        `profile_id, role,
         profile:profiles(id, full_name, role)`,
      )
      .eq("room_id", id),
    supabase
      .from("chat_requests")
      .select(
        "id, source_message_id, kind, title, body, urgency, status, quantity, external_ref, resolved_at, resolution_note",
      )
      .eq("room_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!roomRaw) notFound();
  const room = roomRaw as unknown as Room;
  const messages = (msgsRaw ?? []) as unknown as Message[];
  const members = (memsRaw ?? []) as unknown as Member[];
  const requests = (requestsRaw ?? []) as Array<{
    id: string;
    source_message_id: string;
    kind: string;
    title: string;
    body: string | null;
    urgency: string;
    status: string;
    quantity: number | null;
    external_ref: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
  }>;
  const isDirection = ["admin", "rh", "manager"].includes(profile.role ?? "");

  // Marque comme lu côté serveur (best-effort).
  await supabase
    .from("chat_room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", id)
    .eq("profile_id", profile.id);

  const headerColor = room.site?.color ?? "#c9a34d";

  // Présence pour le bandeau (uniquement si site_group).
  const presents =
    room.kind === "site_group" && room.site_id
      ? await loadCurrentlyIn({ siteId: room.site_id })
      : [];
  const presentsForBar = presents.map((p) => ({
    employee_id: p.employee_id,
    full_name: p.full_name,
    clock_in_at: p.clock_in_at,
    profile_id: p.profile_id,
  }));
  const Icon =
    room.kind === "site_group" ? Hash : room.kind === "dm" ? MessageSquare : Users;

  return (
    <div className="flex flex-col h-[calc(100dvh-90px)] sm:h-[calc(100dvh-110px)] max-h-[900px]">
      <Card className="rounded-b-none border-b-0">
        <div className="p-3 flex items-center gap-3">
          <Link
            href="/chat"
            className="text-ink-3 hover:text-gold-dark p-1 -ml-1"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: headerColor }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate flex items-center gap-2">
              {room.name}
              <span className="text-[10px] font-normal text-ink-3 px-1.5 py-px rounded-full bg-surface-2">
                {members.length} membre{members.length > 1 ? "s" : ""}
              </span>
            </div>
            {room.description ? (
              <div className="text-xs text-ink-3 truncate">{room.description}</div>
            ) : null}
          </div>
        </div>
        {room.kind === "site_group" && room.site_id ? (
          <ChatPresenceBar siteId={room.site_id} initial={presentsForBar} />
        ) : null}
      </Card>

      <Card className="flex-1 rounded-none border-y-0 overflow-hidden flex flex-col min-h-0">
        <ChatThread
          roomId={id}
          initialMessages={messages}
          initialRequests={requests}
          myProfileId={profile.id}
          isDirection={isDirection}
        />
      </Card>

      <Card className="rounded-t-none border-t-0">
        <Composer roomId={id} />
      </Card>
    </div>
  );
}
