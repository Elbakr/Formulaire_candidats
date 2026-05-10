import { ArrowRightLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { toISODate, addDays } from "@/lib/planning";
import { SwapsClient } from "./client";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MySwapsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, weekly_hours")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = emp as
    | { id: string; full_name: string; weekly_hours: number | null }
    | null;

  if (!employee?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("swap.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <ArrowRightLeft className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("swap.no_employee", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date();
  const todayISO = toISODate(today);
  const horizonISO = toISODate(addDays(today, 21));

  const [
    { data: myShiftsRaw },
    { data: colleaguesShiftsRaw },
    { data: receivedRaw },
    { data: mineRaw },
    { data: colleaguesRaw },
  ] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, position, site:sites(code, name, color)")
      .eq("employee_id", employee.id)
      .eq("is_overtime", false)
      .gte("date", todayISO)
      .lte("date", horizonISO)
      .order("date", { ascending: true })
      .limit(60),
    supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, break_minutes, position, employee:employees(id, full_name), site:sites(code, name, color)",
      )
      .neq("employee_id", employee.id)
      .eq("is_overtime", false)
      .gte("date", todayISO)
      .lte("date", horizonISO)
      .order("date", { ascending: true })
      .limit(200),
    supabase
      .from("shift_swap_requests")
      .select(
        "id, requester_employee_id, requester_shift_id, target_employee_id, target_shift_id, status, reason, auto_validated, needs_manager_review, manager_review_reason, created_at, decided_at",
      )
      .eq("target_employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("shift_swap_requests")
      .select(
        "id, requester_employee_id, requester_shift_id, target_employee_id, target_shift_id, status, reason, auto_validated, needs_manager_review, manager_review_reason, created_at, decided_at",
      )
      .eq("requester_employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("status", "active")
      .neq("id", employee.id)
      .order("full_name"),
  ]);

  // Pour afficher contexte des swaps : on charge shifts référencés.
  const allSwapIds = [
    ...(((receivedRaw ?? []) as Array<{ requester_shift_id: string; target_shift_id: string | null }>).flatMap((r) => [r.requester_shift_id, r.target_shift_id])),
    ...(((mineRaw ?? []) as Array<{ requester_shift_id: string; target_shift_id: string | null }>).flatMap((r) => [r.requester_shift_id, r.target_shift_id])),
  ].filter(Boolean) as string[];
  const uniqShiftIds = Array.from(new Set(allSwapIds));
  let shiftsCtx: Array<{
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    employee: { id: string; full_name: string } | null;
  }> = [];
  if (uniqShiftIds.length > 0) {
    const { data } = await supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, employee:employees(id, full_name)")
      .in("id", uniqShiftIds);
    shiftsCtx = (data ?? []) as never;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ArrowRightLeft className="h-7 w-7 text-gold" />
        <div>
          <h1 className="text-2xl font-bold">{t("swap.title", locale)}</h1>
          <p className="text-sm text-ink-2">{t("swap.subtitle", locale)}</p>
        </div>
      </div>

      <SwapsClient
        myEmployeeId={employee.id}
        myShifts={(myShiftsRaw ?? []) as never}
        colleaguesShifts={(colleaguesShiftsRaw ?? []) as never}
        colleagues={(colleaguesRaw ?? []) as never}
        received={(receivedRaw ?? []) as never}
        mine={(mineRaw ?? []) as never}
        shiftsCtx={shiftsCtx}
        locale={locale}
      />
    </div>
  );
}
