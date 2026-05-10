import Link from "next/link";
import { CalendarOff, Clock } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FixedOffDaysForm } from "./fixed-off-days-form";
import { UnavailabilitiesPanel } from "./unavailabilities-panel";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyAvailabilityPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name, fixed_off_days, weekly_hours")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = empRaw as unknown as {
    id: string;
    full_name: string;
    fixed_off_days: number[] | null;
    weekly_hours: number | null;
  } | null;

  if (!employee?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("availability.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <CalendarOff className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("availability.no_employee", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const { data: rawUnavail } = await supabase
    .from("employee_unavailabilities")
    .select("id, day_of_week, date_specific, start_time, end_time, reason, notes, is_active, created_at")
    .eq("employee_id", employee.id)
    .eq("is_active", true)
    .order("date_specific", { ascending: true })
    .order("day_of_week", { ascending: true });
  const unavail = (rawUnavail ?? []) as Array<{
    id: string;
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
  }>;

  const recurring = unavail.filter((u) => u.day_of_week !== null);
  const specific = unavail.filter((u) => u.date_specific !== null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("availability.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("availability.subtitle", locale)}</p>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">{t("availability.fixed_off_days", locale)}</h2>
          <p className="text-xs text-ink-3 mt-0.5">{t("availability.fixed_off_days_hint", locale)}</p>
        </div>
        <FixedOffDaysForm initial={employee.fixed_off_days ?? []} locale={locale} />
      </Card>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm">{t("availability.recurring_unavail", locale)}</h2>
            <p className="text-xs text-ink-3 mt-0.5">{t("availability.recurring_unavail_hint", locale)}</p>
          </div>
        </div>
        <UnavailabilitiesPanel mode="recurring" items={recurring} locale={locale} />
      </Card>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm">{t("availability.specific_unavail", locale)}</h2>
            <p className="text-xs text-ink-3 mt-0.5">{t("availability.specific_unavail_hint", locale)}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/me/time-off">
              <Clock className="h-3.5 w-3.5" /> {t("availability.request_leave", locale)}
            </Link>
          </Button>
        </div>
        <UnavailabilitiesPanel mode="specific" items={specific} locale={locale} />
      </Card>
    </div>
  );
}
