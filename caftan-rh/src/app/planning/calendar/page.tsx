import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { startOfWeek, toISODate, weekRange, parseISODate } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeeklyPlanningBoard } from "./weekly-board";
import { WeekActionsBar } from "./week-actions-bar";

export default async function PlanningCalendarPage(
  props: { searchParams: Promise<{ week?: string }> },
) {
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const todayISO = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [
    { data: emps },
    { data: shifts },
    { data: timeOff },
    { data: holidays },
    { data: closures },
    { data: sites },
    { data: assignments },
    { data: pendingDraftsRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title, weekly_hours, department_id, department:departments(name)")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("shifts")
      .select("*")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("id, employee_id, kind, start_date, end_date, status")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    // Jours fériés actifs sur la semaine — utilisés pour afficher un badge sur
    // les cellules concernées dans le board.
    supabase
      .from("holidays")
      .select("id, date, label, kind, priority, tradition")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    // Fermetures boutique chevauchant la semaine — filtrage par département
    // côté client (selon l'employé). On charge tout puisque ça reste petit.
    supabase
      .from("company_closures")
      .select("id, label, start_date, end_date, department_id, reason")
      .lte("start_date", end)
      .gte("end_date", start)
      .order("start_date"),
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("site_assignments")
      .select("employee_id, site_id, is_primary")
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`),
    // Brouillons auto-generes en attente pour la semaine affichee
    supabase
      .from("auto_plan_drafts")
      .select(`id, site_id, drafts_json, uncovered_json, generated_at,
               site:sites(code, name, color)`)
      .eq("status", "pending")
      .eq("week_monday", toISODate(monday)),
  ]);

  // Drafts approuves dans les dernieres 24h sur cette semaine = rollback dispo
  const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recentApplied } = await supabase
    .from("auto_plan_drafts")
    .select("id")
    .eq("week_monday", toISODate(monday))
    .eq("status", "approved")
    .is("rolled_back_at", null)
    .gte("applied_at", cutoff24h)
    .limit(1);
  const hasRollbackAvailable = (recentApplied ?? []).length > 0;

  // Map empId → siteIds (préférés en tête : is_primary first)
  const assignsByEmp = new Map<string, string[]>();
  for (const a of (assignments ?? []) as Array<{
    employee_id: string;
    site_id: string;
    is_primary: boolean;
  }>) {
    const arr = assignsByEmp.get(a.employee_id) ?? [];
    if (a.is_primary) arr.unshift(a.site_id);
    else arr.push(a.site_id);
    assignsByEmp.set(a.employee_id, arr);
  }
  const employeesWithSites = ((emps ?? []) as Array<{ id: string }>).map((e) => ({
    ...e,
    preferred_site_ids: assignsByEmp.get(e.id) ?? [],
  }));

  type PendingDraft = {
    id: string;
    site_id: string;
    drafts_json: Array<unknown> | null;
    uncovered_json: Array<{ missing?: number }> | null;
    generated_at: string;
    site: { code: string; name: string; color: string | null } | null;
  };
  const pendingDrafts = ((pendingDraftsRaw ?? []) as unknown as PendingDraft[]);
  const totalDraftShifts = pendingDrafts.reduce(
    (a, d) => a + (d.drafts_json?.length ?? 0),
    0,
  );
  const totalUncovered = pendingDrafts.reduce(
    (a, d) => a + (d.uncovered_json ?? []).reduce((s, u) => s + (u.missing ?? 0), 0),
    0,
  );

  const sitesForActions = ((sites ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
  }>);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <WeekActionsBar
          sites={sitesForActions}
          mondayISO={toISODate(monday)}
          hasRollbackAvailable={hasRollbackAvailable}
        />
      </div>
      {pendingDrafts.length > 0 ? (
        <Card className="border-gold">
          <div className="p-3 flex items-center gap-3 flex-wrap bg-gold-light/30">
            <Sparkles className="h-5 w-5 text-gold-dark shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-sm">
                Planning auto pré-généré pour la semaine du {toISODate(monday)}
              </div>
              <div className="text-xs text-ink-2">
                <span className="font-bold">{totalDraftShifts}</span> shifts proposés sur{" "}
                <span className="font-bold">{pendingDrafts.length}</span> site
                {pendingDrafts.length > 1 ? "s" : ""}
                {totalUncovered > 0 ? (
                  <>
                    {" · "}
                    <span className="text-warn font-bold">{totalUncovered} créneaux non couverts</span>
                  </>
                ) : null}{" "}
                · à valider pour basculer dans le board ci-dessous
              </div>
              <div className="text-[10px] text-ink-3 mt-1 truncate">
                Sites concernés :{" "}
                {pendingDrafts
                  .map((d) => d.site?.code ?? "?")
                  .join(", ")}
              </div>
            </div>
            <Button asChild variant="gold" size="sm">
              <Link href={`/planning/auto-drafts?week=${toISODate(monday)}`}>
                Voir + valider <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}
      <WeeklyPlanningBoard
        mondayISO={toISODate(monday)}
        employees={employeesWithSites as never}
        shifts={(shifts ?? []) as never}
        timeOff={(timeOff ?? []) as never}
        holidays={(holidays ?? []) as never}
        closures={(closures ?? []) as never}
        sites={(sites ?? []) as never}
      />
    </div>
  );
}
