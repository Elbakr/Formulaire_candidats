import { ClipboardList } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { MyOnboardingPanel } from "./panel";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

type Run = {
  id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
};

type Item = {
  id: string;
  run_id: string;
  label: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  responsible_role: string;
  position: number;
  done_at: string | null;
};

export default async function MyOnboardingPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: empData } = await supabase
    .from("employees")
    .select("id, full_name, start_date")
    .eq("profile_id", user.id)
    .maybeSingle();
  const employee = empData as unknown as {
    id: string;
    full_name: string;
    start_date: string;
  } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("onboarding.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <ClipboardList className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              {t("onboarding.no_employee", locale)}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const { data: runData } = await supabase
    .from("onboarding_runs")
    .select("id, employee_id, started_at, completed_at")
    .eq("employee_id", employee.id)
    .maybeSingle();
  const run = runData as unknown as Run | null;

  let allItems: Item[] = [];
  if (run) {
    const { data: itemsData } = await supabase
      .from("onboarding_run_items")
      .select(
        "id, run_id, label, description, category, is_required, responsible_role, position, done_at",
      )
      .eq("run_id", run.id)
      .order("position");
    allItems = (itemsData ?? []) as unknown as Item[];
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("onboarding.title", locale)}</h1>
        <p className="text-sm text-ink-2">
          {t("onboarding.welcome", locale, { name: employee.full_name })}
        </p>
      </div>
      {!run ? (
        <Card>
          <div className="p-10 text-center">
            <ClipboardList className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              {t("onboarding.no_run", locale)}
            </p>
          </div>
        </Card>
      ) : (
        <MyOnboardingPanel run={run} items={allItems} locale={locale} />
      )}
    </div>
  );
}
