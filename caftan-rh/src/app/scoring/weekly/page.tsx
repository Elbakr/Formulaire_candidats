import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { startOfWeek, addDays, toISODate } from "@/lib/planning";
import { RatingCard } from "./rating-card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeeklyScoringPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const today = new Date();
  const monday = startOfWeek(today);
  const mondayISO = toISODate(monday);
  const sundayISO = toISODate(addDays(monday, 6));
  const fourWeeksBack = toISODate(addDays(monday, -28));

  // Périmètre employés.
  let empQuery = supabase
    .from("employees")
    .select("id, full_name, job_title, status, manager_id")
    .eq("status", "active")
    .order("full_name");
  if (profile.role === "manager") {
    empQuery = empQuery.eq("manager_id", profile.id);
  }
  const { data: empsRaw } = await empQuery;
  type Emp = {
    id: string;
    full_name: string;
    job_title: string | null;
    status: string;
    manager_id: string | null;
  };
  const employees = (empsRaw ?? []) as unknown as Emp[];
  const employeeIds = employees.map((e) => e.id);

  const todayISO = toISODate(today);

  // Site d'affectation principal.
  const { data: assignsRaw } = employeeIds.length
    ? await supabase
        .from("site_assignments")
        .select("employee_id, is_primary, site:sites(code)")
        .in("employee_id", employeeIds)
        .lte("start_date", todayISO)
        .or(`end_date.is.null,end_date.gte.${todayISO}`)
    : { data: [] };
  type AssignRow = {
    employee_id: string;
    is_primary: boolean;
    site: { code: string } | null;
  };
  const assigns = (assignsRaw ?? []) as unknown as AssignRow[];
  const siteByEmp = new Map<string, string>();
  for (const a of assigns) {
    if (!a.site) continue;
    const existing = siteByEmp.get(a.employee_id);
    if (!existing || a.is_primary) siteByEmp.set(a.employee_id, a.site.code);
  }

  // Notes existantes (semaine en cours + historique 4 semaines).
  const { data: ratingsRaw } = employeeIds.length
    ? await supabase
        .from("weekly_employee_ratings")
        .select("id, employee_id, week_monday, rating, comment")
        .in("employee_id", employeeIds)
        .gte("week_monday", fourWeeksBack)
        .order("week_monday", { ascending: false })
    : { data: [] };
  type RatingRow = {
    id: string;
    employee_id: string;
    week_monday: string;
    rating: number;
    comment: string | null;
  };
  const ratings = (ratingsRaw ?? []) as unknown as RatingRow[];
  const ratingByEmp = new Map<string, RatingRow[]>();
  for (const r of ratings) {
    const arr = ratingByEmp.get(r.employee_id) ?? [];
    arr.push(r);
    ratingByEmp.set(r.employee_id, arr);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notation hebdomadaire</h1>
        <p className="text-sm text-ink-2">
          Semaine du <strong>{formatDate(mondayISO)}</strong> au <strong>{formatDate(sundayISO)}</strong>.
          Note rapide 1-5 et commentaire confidentiel optionnel. Une semaine non saisie est neutre dans le KPI.
        </p>
      </div>

      <Card>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun employé dans ton périmètre pour le moment.
          </div>
        ) : (
          employees.map((e) => {
            const empRatings = ratingByEmp.get(e.id) ?? [];
            const current = empRatings.find((r) => r.week_monday === mondayISO) ?? null;
            const history = empRatings.filter((r) => r.week_monday !== mondayISO);
            return (
              <RatingCard
                key={e.id}
                employeeId={e.id}
                fullName={e.full_name}
                jobTitle={e.job_title}
                siteCode={siteByEmp.get(e.id) ?? null}
                weekMonday={mondayISO}
                currentRating={current?.rating ?? null}
                currentComment={current?.comment ?? null}
                history={history.map((h) => ({ week_monday: h.week_monday, rating: h.rating }))}
              />
            );
          })
        )}
      </Card>
    </div>
  );
}
