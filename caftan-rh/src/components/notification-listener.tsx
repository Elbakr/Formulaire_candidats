"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { playSound, unlockAudio } from "@/lib/notification-sound";

/**
 * Écoute globale des événements importants pour déclencher un son + toast :
 *   - Nouveau message dans une room dont je suis membre, sauf si la room est
 *     déjà ouverte (URL `/chat/{roomId}`)
 *   - Demande chat avec urgency='urgent' → son urgent
 *   - Anomalies severity='critical'      → son urgent
 *
 * Stocké dans le RootLayout pour être actif sur toutes les pages.
 */
export function NotificationListener({ profileId }: { profileId: string }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Premier click utilisateur → débloque l'audio (Safari/Chrome auto-play).
  useEffect(() => {
    const onFirstClick = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", onFirstClick);
    };
    window.addEventListener("pointerdown", onFirstClick);
    return () => window.removeEventListener("pointerdown", onFirstClick);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    const supabase = createClient();

    // 1) Charge mes rooms (je n'écoute que celles-là).
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: members } = await supabase
        .from("chat_room_members")
        .select("room_id")
        .eq("profile_id", profileId);
      if (cancelled) return;
      const myRoomIds = new Set(
        ((members ?? []) as { room_id: string }[]).map((m) => m.room_id),
      );

      channel = supabase
        .channel(`global-notif-${profileId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
          },
          async (payload) => {
            const m = payload.new as {
              id: string;
              room_id: string;
              author_profile_id: string | null;
              body: string;
              attachments: unknown;
            };
            if (m.author_profile_id === profileId) return;
            if (!myRoomIds.has(m.room_id)) return;
            // Si la room est déjà ouverte, l'utilisateur voit déjà le message
            if (pathnameRef.current === `/chat/${m.room_id}`) return;

            // Détection mention @nom (basique)
            const isMention = /(^|\s)@\w+/.test(m.body ?? "");
            // Détection demande urgente
            const att = Array.isArray(m.attachments) ? m.attachments : [];
            const firstAtt = att[0] as
              | { kind?: string; urgency?: string; request_kind?: string }
              | undefined;
            const isUrgent =
              firstAtt?.kind === "chat_request" && firstAtt?.urgency === "urgent";
            const isPresence = firstAtt?.kind === "presence_event";

            // Pas de son pour les présences (trop fréquent + signal faible)
            if (isPresence) return;

            // Récupère nom auteur pour le toast
            const { data: author } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", m.author_profile_id ?? "")
              .maybeSingle();
            const who = (author as { full_name: string | null } | null)?.full_name ?? "Quelqu'un";

            if (isUrgent) {
              playSound("urgent");
              toast.error(`🚨 ${who} — demande URGENTE`, {
                description: m.body.slice(0, 120),
              });
            } else if (isMention) {
              playSound("important");
              toast.message(`@ ${who} t'a mentionné`, {
                description: m.body.slice(0, 120),
              });
            } else {
              playSound("chat");
              toast.message(who, {
                description: m.body.slice(0, 120),
              });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "anomaly_flags",
          },
          (payload) => {
            const a = payload.new as { severity: string; reason?: string };
            if (a.severity !== "critical") return;
            playSound("urgent");
            toast.error("🚨 Anomalie critique", {
              description: a.reason ?? "Voir /admin/anomalies",
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_room_members",
            filter: `profile_id=eq.${profileId}`,
          },
          (payload) => {
            const r = payload.new as { room_id: string };
            myRoomIds.add(r.room_id);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [profileId]);

  return null;
}
