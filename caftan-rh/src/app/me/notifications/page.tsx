import { Bell } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { MarkAllReadButton } from "./mark-all-read-button";
import { NotificationsList } from "./notifications-list";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function NotificationsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const items = (data ?? []) as Array<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }>;
  const unread = items.filter((n) => !n.read_at).length;

  const subtitle =
    items.length <= 1
      ? t("notifications.subtitle_count_one", locale, {
          total: items.length,
          unread,
        })
      : t("notifications.subtitle_count_many", locale, {
          total: items.length,
          unread,
        });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("notifications.title", locale)}</h1>
          <p className="text-sm text-ink-2">{subtitle}</p>
        </div>
        {unread > 0 ? <MarkAllReadButton locale={locale} /> : null}
      </div>

      <Card>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              {t("notifications.empty", locale)}
            </p>
          </div>
        ) : (
          <NotificationsList items={items} />
        )}
      </Card>
    </div>
  );
}
