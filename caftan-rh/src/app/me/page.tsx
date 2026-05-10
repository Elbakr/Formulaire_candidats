import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Briefcase, ArrowRight } from "lucide-react";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import type { ApplicationStatus } from "@/types/database.types";

export default async function MyApplicationsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: candidates } = await supabase
    .from("candidates")
    .select(`id, applications(id, status, created_at, updated_at, job:jobs(id, title))`)
    .eq("profile_id", user.id);

  const apps = (candidates ?? []).flatMap((c: { applications?: unknown[] }) => c.applications ?? []) as unknown as Array<{
    id: string;
    status: ApplicationStatus;
    created_at: string;
    updated_at: string;
    job: { id: string; title: string } | null;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("applications.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("applications.subtitle", locale)}</p>
      </div>

      {apps.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <Briefcase className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2 mb-4">{t("applications.empty", locale)}</p>
            <Button asChild variant="gold">
              <Link href="/postuler">{t("applications.see_offers", locale)} <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {apps.map((a) => (
            <Card key={a.id}>
              <div className="p-4 flex items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{a.job?.title ?? t("applications.spontaneous", locale)}</div>
                  <div className="text-xs text-ink-3">
                    {t("applications.posted_on", locale, { date: formatDate(a.created_at) })} · {t("applications.updated_on", locale, { date: formatDate(a.updated_at) })}
                  </div>
                </div>
                <Badge variant={a.status as never}>{STATUS_LABELS[a.status]}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
