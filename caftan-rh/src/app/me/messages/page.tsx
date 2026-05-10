import { MessageSquare } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyMessagesPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: cands } = await supabase
    .from("candidates")
    .select("id")
    .eq("profile_id", user.id);
  const candIds = ((cands ?? []) as { id: string }[]).map((c) => c.id);

  let messages: Array<{
    id: string;
    subject: string | null;
    body: string;
    direction: string;
    created_at: string;
    application: { id: string; job: { title: string } | null } | null;
  }> = [];

  if (candIds.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("id")
      .in("candidate_id", candIds);
    const appIds = ((apps ?? []) as { id: string }[]).map((a) => a.id);
    if (appIds.length > 0) {
      const { data } = await supabase
        .from("messages")
        .select("id, subject, body, direction, created_at, application:applications(id, job:jobs(title))")
        .in("application_id", appIds)
        .order("created_at", { ascending: false });
      messages = (data ?? []) as unknown as typeof messages;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("messages.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("messages.subtitle", locale)}</p>
      </div>
      {messages.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <MessageSquare className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("messages.empty", locale)}</p>
            <p className="text-xs text-ink-3 mt-1">{t("messages.empty_hint", locale)}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Card key={m.id}>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${m.direction === "outbound" ? "bg-info-light text-info" : "bg-success-light text-success"}`}>
                    {m.direction === "outbound" ? t("messages.received", locale) : t("messages.sent", locale)}
                  </span>
                  <span className="text-xs text-ink-3">{formatDateTime(m.created_at)}</span>
                </div>
                {m.subject ? <div className="font-bold text-sm mb-1">{m.subject}</div> : null}
                <div className="text-sm whitespace-pre-wrap text-ink-2">{m.body}</div>
                {m.application?.job ? (
                  <div className="text-xs text-ink-3 mt-2">{t("messages.about", locale)} {m.application.job.title}</div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
