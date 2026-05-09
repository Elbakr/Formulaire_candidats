import { Calendar } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { shiftHours } from "@/lib/planning";

export default async function MyPlanningPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, job_title, weekly_hours, status, department:departments(name)")
    .eq("profile_id", user.id)
    .maybeSingle();

  const employee = emp as unknown as {
    id: string;
    full_name: string;
    job_title: string | null;
    weekly_hours: number | null;
    status: string;
    department: { name: string } | null;
  } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Mon planning</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <Calendar className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Tu n'es pas (encore) enregistré comme employé.</p>
            <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">Cette section sera active dès que tu seras embauché·e via la plateforme ou ajouté·e par un RH.</p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, date, start_time, end_time, break_minutes, position, location, notes")
    .eq("employee_id", employee.id)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(50);

  const list = (shifts ?? []) as unknown as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    position: string | null;
    location: string | null;
    notes: string | null;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mon planning</h1>
        <p className="text-sm text-ink-2">
          {employee.job_title ?? "—"} · {employee.department?.name ?? "Sans service"} · {employee.weekly_hours ?? 38}h/sem
        </p>
      </div>

      {list.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <Calendar className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Aucun shift planifié.</p>
            <p className="text-xs text-ink-3 mt-1">Ton manager va planifier tes shifts à venir.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((s) => {
            const hours = shiftHours(s.start_time, s.end_time, s.break_minutes);
            return (
              <Card key={s.id}>
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="w-12 h-12 rounded-md bg-gold-light text-gold-dark flex flex-col items-center justify-center shrink-0">
                    <div className="text-[10px] uppercase font-bold leading-none">
                      {new Date(s.date).toLocaleDateString("fr-BE", { weekday: "short" })}
                    </div>
                    <div className="font-bold text-base leading-none mt-1">
                      {new Date(s.date).getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold">
                      {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      <span className="font-normal text-ink-3 text-xs ml-2">
                        ({hours.toFixed(1)}h{s.break_minutes ? ` · pause ${s.break_minutes} min` : ""})
                      </span>
                    </div>
                    <div className="text-xs text-ink-2 mt-0.5">
                      {s.position ?? "Poste à définir"} · {s.location ?? "—"}
                    </div>
                    {s.notes ? <div className="text-xs text-ink-3 mt-1 italic">{s.notes}</div> : null}
                  </div>
                  <span className="text-[11px] text-ink-3 hidden md:inline">{formatDate(s.date)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
