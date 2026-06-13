"use client";

import Link from "next/link";
import { useState } from "react";
import { cn, formatDateTime } from "@/lib/utils";
import { notifHref } from "@/lib/notif-href";
import { markReadAction } from "./actions";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// Karim 2026-06-13 : chaque ligne ouvre DIRECTEMENT l'ecran d'action (notifHref)
// et marque la notif lue au clic. Plus de detour par la page detail quand la
// notif pointe vers un objet actionnable.
export function NotificationsList({ items }: { items: Item[] }) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  return (
    <ul className="divide-y divide-line">
      {items.map((n) => {
        const isRead = !!n.read_at || readIds.has(n.id);
        return (
          <li key={n.id}>
            <Link
              href={notifHref(n)}
              onClick={() => {
                if (!n.read_at && !readIds.has(n.id)) {
                  setReadIds((s) => new Set(s).add(n.id));
                  void markReadAction(n.id);
                }
              }}
              className={cn(
                "block p-3 hover:bg-surface-2 transition-colors",
                !isRead && "bg-gold-light/30",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0",
                    isRead ? "bg-line" : "bg-gold",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{n.title}</div>
                  {n.body ? <div className="text-xs text-ink-2 mt-0.5">{n.body}</div> : null}
                  <div className="text-[11px] text-ink-3 mt-1">
                    {formatDateTime(n.created_at)} · {n.kind}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
