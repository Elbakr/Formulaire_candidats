import { Clock, AlertCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ClockButton } from "./clock-button";
import { formatDateTime } from "@/lib/utils";

export default async function MyClockPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = emp as unknown as { id: string; full_name: string } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold">Pointage</h1></div>
        <Card>
          <div className="p-10 text-center">
            <AlertCircle className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Tu n'es pas (encore) enregistré comme employé actif.</p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const startOfToday = new Date(`${today}T00:00:00`).toISOString();

  const [{ data: shifts }, { data: entries }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, position, location, status")
      .eq("employee_id", employee.id)
      .eq("date", today)
      .order("start_time", { ascending: true }),
    supabase
      .from("clock_entries")
      .select("id, kind, occurred_at, shift_id")
      .eq("employee_id", employee.id)
      .gte("occurred_at", startOfToday)
      .order("occurred_at", { ascending: false }),
  ]);

  const todayShifts = (shifts ?? []) as unknown as Array<{
    id: string; date: string; start_time: string; end_time: string;
    position: string | null; location: string | null; status: string;
  }>;
  const todayEntries = (entries ?? []) as unknown as Array<{
    id: string; kind: "in" | "out"; occurred_at: string; shift_id: string | null;
  }>;

  const lastEntry = todayEntries[0];
  const isClockedIn = lastEntry?.kind === "in";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pointage</h1>
        <p className="text-sm text-ink-2">Pointe ton arrivée et ton départ. Cela alimente automatiquement le calcul de ta ponctualité.</p>
      </div>

      <Card>
        <div className="p-6 flex items-center gap-6 flex-wrap">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isClockedIn ? "bg-success-light" : "bg-surface-2"}`}>
            <Clock className={`h-10 w-10 ${isClockedIn ? "text-success" : "text-ink-3"}`} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[11px] uppercase font-bold tracking-wider text-ink-3">Statut actuel</div>
            <div className="text-2xl font-bold mt-1">
              {isClockedIn ? "Au travail" : todayEntries.length > 0 ? "Sortie effectuée" : "Pas encore arrivé·e"}
            </div>
            {lastEntry ? (
              <div className="text-xs text-ink-3 mt-1">
                Dernière action : <strong>{lastEntry.kind === "in" ? "Arrivée" : "Départ"}</strong> à {formatDateTime(lastEntry.occurred_at)}
              </div>
            ) : null}
          </div>
          <ClockButton
            employeeId={employee.id}
            isClockedIn={isClockedIn}
            todayShiftId={todayShifts[0]?.id ?? null}
          />
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Tes shifts d'aujourd'hui</h2>
        </div>
        {todayShifts.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Aucun shift planifié aujourd'hui.</div>
        ) : (
          <ul className="divide-y divide-line">
            {todayShifts.map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-gold-dark" />
                <div className="flex-1">
                  <div className="font-bold">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</div>
                  <div className="text-xs text-ink-3">{s.position ?? "—"} · {s.location ?? "—"}</div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Historique du jour</h2>
        </div>
        {todayEntries.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Pas encore de pointage aujourd'hui.</div>
        ) : (
          <ul className="divide-y divide-line">
            {todayEntries.map((e) => (
              <li key={e.id} className="p-3 flex items-center gap-3 text-sm">
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${e.kind === "in" ? "bg-success-light text-success" : "bg-info-light text-info"}`}>
                  {e.kind === "in" ? "Arrivée" : "Départ"}
                </span>
                <span className="font-mono">{new Date(e.occurred_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
