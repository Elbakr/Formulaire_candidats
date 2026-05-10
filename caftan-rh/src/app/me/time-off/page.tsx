import { CalendarOff } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TimeOffMyPanel } from "./time-off-my-panel";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyTimeOffPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = emp as unknown as { id: string } | null;

  if (!employee?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("time_off.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <CalendarOff className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("time_off.no_employee", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const { data } = await supabase
    .from("time_off_requests")
    .select(
      "id, kind, start_date, end_date, reason, status, created_at, decided_at, auto_validated, auto_validation_reason",
    )
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("time_off.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("time_off.subtitle", locale)}</p>
      </div>
      <TimeOffMyPanel
        employeeId={employee.id}
        requests={(data ?? []) as never}
        locale={locale}
      />
    </div>
  );
}
