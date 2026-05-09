"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { markAllReadAction, markReadAction } from "@/app/me/notifications/actions";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data ?? []) as Notification[]);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtime("notifications", refresh, `recipient_id=eq.${userId}`);

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-white/85" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 bg-gold text-[#1a1a0d] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-h-[400px] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-line">
          <span className="font-bold text-sm">Notifications</span>
          {unread > 0 ? (
            <button
              onClick={async () => { await markAllReadAction(); await refresh(); }}
              className="text-[11px] text-gold-dark font-bold hover:underline flex items-center gap-1"
            >
              <CheckCheck className="h-3 w-3" /> Tout marquer lu
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-3">Aucune notification.</div>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "#"}
                  onClick={async () => { if (!n.read_at) { await markReadAction(n.id); await refresh(); } }}
                  className={cn(
                    "block px-3 py-2 border-b border-line text-xs hover:bg-surface-2 transition-colors",
                    !n.read_at && "bg-gold-light/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn("mt-1 h-2 w-2 rounded-full shrink-0", n.read_at ? "bg-line" : "bg-gold")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{n.title}</div>
                      {n.body ? <div className="text-ink-2 mt-0.5 line-clamp-2">{n.body}</div> : null}
                      <div className="text-[10px] text-ink-3 mt-0.5">{new Date(n.created_at).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="px-3 py-2 border-t border-line text-center">
          <Link href="/me/notifications" className="text-[11px] font-bold text-gold-dark hover:underline">
            Voir toutes les notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
