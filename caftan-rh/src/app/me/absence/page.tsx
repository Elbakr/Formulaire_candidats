import { AlertCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AbsenceClient } from "./client";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyAbsencePage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = emp as { id: string; full_name: string } | null;

  if (!employee?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("absence.title_short", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <AlertCircle className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("absence.no_employee", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const { data: absencesRaw } = await supabase
    .from("unplanned_absences")
    .select(
      "id, date, reason, status, replacement_employee_id, justification_url, notes, reported_at, resolved_at, shift:shifts(date, start_time, end_time, site:sites(code, name))",
    )
    .eq("employee_id", employee.id)
    .order("reported_at", { ascending: false })
    .limit(40);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-7 w-7 text-danger" />
        <div>
          <h1 className="text-2xl font-bold">{t("absence.title", locale)}</h1>
          <p className="text-sm text-ink-2">{t("absence.subtitle", locale)}</p>
        </div>
      </div>

      <AbsenceClient
        employeeId={employee.id}
        absences={(absencesRaw ?? []) as never}
        locale={locale}
      />
    </div>
  );
}
