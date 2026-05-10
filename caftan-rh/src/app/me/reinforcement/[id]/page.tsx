import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, AlertCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReinforcementResponseButtons } from "./response-buttons";
import { getLocale } from "@/lib/locale-server";
import { t, dateLocaleStr, type TranslationKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const STATUS_KEYS: Record<string, { key: TranslationKey; cls: string }> = {
  open: { key: "reinforcement.status.open", cls: "bg-warn-light text-warn" },
  sent_to_employee: {
    key: "reinforcement.status.sent_to_employee",
    cls: "bg-info-light text-info",
  },
  accepted: { key: "reinforcement.status.accepted", cls: "bg-success-light text-success" },
  declined: { key: "reinforcement.status.declined", cls: "bg-danger-light text-danger" },
  covered: { key: "reinforcement.status.covered", cls: "bg-success-light text-success" },
  cancelled: { key: "reinforcement.status.cancelled", cls: "bg-surface-2 text-ink-3" },
  expired: { key: "reinforcement.status.expired", cls: "bg-surface-2 text-ink-3" },
};

export default async function ReinforcementDetailPage(
  props: PageProps<"/me/reinforcement/[id]">,
) {
  const { id } = await props.params;
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select(
      `id, site_id, date, start_time, end_time, position, notes, status,
       proposed_employee_id, proposed_at, responded_at, expires_at, created_at,
       site:sites(code, name, address, city)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();

  type Row = {
    id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    notes: string | null;
    status: string;
    proposed_employee_id: string | null;
    proposed_at: string | null;
    responded_at: string | null;
    expires_at: string | null;
    site: {
      code: string;
      name: string;
      address: string | null;
      city: string | null;
    } | null;
  };
  const r = req as unknown as Row;

  // Vérifier que l'utilisateur est bien l'employé proposé
  const { data: emp } = await supabase
    .from("employees")
    .select("id, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const myEmpId = (emp as { id: string } | null)?.id ?? null;
  const itsMine = myEmpId !== null && myEmpId === r.proposed_employee_id;

  if (!itsMine) {
    redirect("/me");
  }

  const lab = STATUS_KEYS[r.status] ?? {
    key: "reinforcement.status.cancelled" as TranslationKey,
    cls: "bg-surface-2 text-ink-3",
  };
  const dateFr = new Date(r.date + "T00:00:00").toLocaleDateString(dateLocaleStr(locale), {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const expiresInH = r.expires_at
    ? Math.max(
        0,
        Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 3600000),
      )
    : null;

  const canRespond = r.status === "sent_to_employee";

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/me">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("common.back", locale)}
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-start gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{t("reinforcement.title", locale)}</h1>
            <p className="text-sm text-ink-2">
              {t("reinforcement.subtitle", locale)}
            </p>
          </div>
          <span
            className={`ml-auto px-3 py-1 rounded-full text-xs font-bold uppercase ${lab.cls}`}
          >
            {t(lab.key, locale)}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
                {t("reinforcement.site", locale)}
              </div>
              <div className="font-bold mt-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-gold-dark" />
                {r.site?.code} — {r.site?.name}
              </div>
              {r.site?.address ? (
                <div className="text-xs text-ink-3 mt-1">{r.site.address}</div>
              ) : null}
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
                {t("reinforcement.when", locale)}
              </div>
              <div className="font-bold mt-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gold-dark" />
                {dateFr}
              </div>
              <div className="text-xs text-ink-3 mt-1">
                {r.start_time.slice(0, 5)} → {r.end_time.slice(0, 5)}
              </div>
            </div>
            {r.position ? (
              <div className="bg-surface-2 rounded-md p-3">
                <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
                  {t("reinforcement.position_label", locale)}
                </div>
                <div className="font-bold mt-1">{r.position}</div>
              </div>
            ) : null}
            {r.notes ? (
              <div className="bg-surface-2 rounded-md p-3 sm:col-span-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
                  {t("reinforcement.notes_label", locale)}
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{r.notes}</div>
              </div>
            ) : null}
          </div>

          {canRespond && expiresInH != null ? (
            <div className="flex items-center gap-2 text-xs text-warn">
              <AlertCircle className="h-3.5 w-3.5" />
              {expiresInH > 0
                ? t("reinforcement.expires_in", locale, { hours: expiresInH })
                : t("reinforcement.expires_soon", locale)}
            </div>
          ) : null}

          {canRespond ? (
            <ReinforcementResponseButtons requestId={r.id} locale={locale} />
          ) : (
            <div className="text-sm text-ink-3 italic">
              {r.status === "covered"
                ? t("reinforcement.already_accepted", locale)
                : r.status === "declined"
                  ? t("reinforcement.already_declined", locale)
                  : r.status === "expired"
                    ? t("reinforcement.already_expired", locale)
                    : t("reinforcement.no_action", locale)}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
