import Link from "next/link";
import { Bell } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkAllReadButton } from "./mark-all-read-button";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const items = (data ?? []) as Array<{
    id: string; kind: string; title: string; body: string | null;
    link: string | null; read_at: string | null; created_at: string;
  }>;
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-ink-2">{items.length} notifications · {unread} non lue{unread > 1 ? "s" : ""}.</p>
        </div>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </div>

      <Card>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Aucune notification.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "#"}
                  className={cn(
                    "block p-3 hover:bg-surface-2 transition-colors",
                    !n.read_at && "bg-gold-light/30",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-1 h-2 w-2 rounded-full shrink-0", n.read_at ? "bg-line" : "bg-gold")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{n.title}</div>
                      {n.body ? <div className="text-xs text-ink-2 mt-0.5">{n.body}</div> : null}
                      <div className="text-[11px] text-ink-3 mt-1">{formatDateTime(n.created_at)} · {n.kind}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
