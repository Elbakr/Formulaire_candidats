import Link from "next/link";
import { MessageSquare, Hash, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { loadMyRooms } from "@/lib/chat";

export default async function ChatIndexPage() {
  await requireProfile();
  const rooms = await loadMyRooms();

  const sites = rooms.filter((r) => r.kind === "site_group");
  const groups = rooms.filter((r) => r.kind === "custom_group");
  const dms = rooms.filter((r) => r.kind === "dm");

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-gold-dark" />
          Messagerie
        </h1>
        <p className="text-sm text-ink-2">
          Discute avec ton équipe en direct. 6 groupes par site (A→F) +
          conversations privées.
        </p>
      </div>

      {sites.length > 0 ? (
        <Section title="Groupes par site" icon={<Hash className="h-4 w-4" />}>
          {sites.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </Section>
      ) : null}

      {groups.length > 0 ? (
        <Section title="Groupes personnalisés" icon={<Users className="h-4 w-4" />}>
          {groups.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </Section>
      ) : null}

      {dms.length > 0 ? (
        <Section title="Conversations privées" icon={<MessageSquare className="h-4 w-4" />}>
          {dms.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </Section>
      ) : null}

      {rooms.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <MessageSquare className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              Aucune conversation pour le moment.
            </p>
            <p className="text-xs text-ink-3 mt-1">
              Lance{" "}
              <code className="font-mono bg-surface-2 px-1 rounded">
                npm run seed:chat-rooms
              </code>{" "}
              pour créer les 6 groupes par site.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider font-bold text-ink-3 mb-1.5 flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RoomCard({
  room,
}: {
  room: Awaited<ReturnType<typeof loadMyRooms>>[number];
}) {
  const colorBg = room.site?.color ?? "#c9a34d";
  return (
    <Link href={`/chat/${room.id}`} className="block group">
      <Card className="transition-all hover:shadow-md">
        <div className="p-3 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-white shrink-0"
            style={{ backgroundColor: colorBg }}
          >
            {room.kind === "site_group" && room.site?.code
              ? room.site.code
              : room.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate">{room.name}</span>
              {room.unread > 0 ? (
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-gold text-[#1a1a0d] shrink-0">
                  {room.unread > 99 ? "99+" : room.unread}
                </span>
              ) : null}
            </div>
            {room.last_message ? (
              <div className="text-xs text-ink-3 truncate">
                {room.last_message.body}
              </div>
            ) : (
              <div className="text-xs text-ink-3 italic">Aucun message.</div>
            )}
          </div>
          {room.last_message ? (
            <span className="text-[10px] text-ink-3 hidden md:inline shrink-0">
              {new Date(room.last_message.created_at).toLocaleString("fr-BE", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
