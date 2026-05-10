import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

const DOW_LABELS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

const DAY_LABELS_OFF = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const REASON_LABELS: Record<string, string> = {
  cours: "Cours",
  examen: "Examen",
  medical: "Médical",
  perso: "Personnel",
  autre: "Autre",
};

/**
 * Section "Dispos déclarées" affichée sur la fiche employé.
 * Lecture seule en V1 — l'employé reste seul propriétaire de ses dispos.
 * Les admin/RH peuvent voir mais on n'écrase pas sans accord employé.
 */
export async function EmployeeAvailabilitySection({
  employeeId,
  fixedOffDays,
}: {
  employeeId: string;
  fixedOffDays: number[] | null;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_unavailabilities")
    .select("id, day_of_week, date_specific, start_time, end_time, reason, notes, is_active")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("date_specific", { ascending: true })
    .order("day_of_week", { ascending: true });

  const items = (data ?? []) as Array<{
    id: string;
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    notes: string | null;
    is_active: boolean;
  }>;

  const recurring = items.filter((i) => i.day_of_week !== null);
  const specific = items.filter((i) => i.date_specific !== null);
  const offSet = new Set((fixedOffDays ?? []).filter((d) => d >= 0 && d <= 6));

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-ink-2" />
        <div>
          <h2 className="font-bold text-sm">Dispos déclarées par l'employé</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Lecture seule (l'employé gère via <code>/me/availability</code>). Le solver
            consomme ces contraintes.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5">
            Jours toujours OFF
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS_OFF.map((d, i) => (
              <span
                key={d}
                className={
                  offSet.has(i)
                    ? "px-2.5 py-1 rounded-md text-xs font-bold bg-violet text-white"
                    : "px-2.5 py-1 rounded-md text-xs font-semibold border border-line bg-surface text-ink-3"
                }
              >
                {d}
              </span>
            ))}
          </div>
          {offSet.size === 0 ? (
            <p className="text-[11px] text-ink-3 mt-1">Aucun jour off déclaré.</p>
          ) : null}
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5">
            Indispos récurrentes
          </div>
          {recurring.length === 0 ? (
            <p className="text-xs text-ink-3">Aucun créneau récurrent déclaré.</p>
          ) : (
            <ul className="space-y-1">
              {recurring.map((u) => (
                <li key={u.id} className="text-xs text-ink-2 flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{DOW_LABELS[u.day_of_week ?? 0]}</span>
                  <span className="font-mono text-ink-3">
                    {u.start_time?.slice(0, 5) ?? "—"} – {u.end_time?.slice(0, 5) ?? "—"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-ink-3 font-bold">
                    {u.reason ? REASON_LABELS[u.reason] ?? u.reason : "—"}
                  </span>
                  {u.notes ? (
                    <span className="italic text-ink-3">"{u.notes}"</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5">
            Absences ponctuelles
          </div>
          {specific.length === 0 ? (
            <p className="text-xs text-ink-3">Aucune absence ponctuelle déclarée.</p>
          ) : (
            <ul className="space-y-1">
              {specific.map((u) => (
                <li key={u.id} className="text-xs text-ink-2 flex items-center gap-2 flex-wrap">
                  <span className="font-bold">
                    {u.date_specific ? formatDate(u.date_specific) : "—"}
                  </span>
                  <span className="font-mono text-ink-3">
                    {u.start_time && u.end_time
                      ? `${u.start_time.slice(0, 5)} – ${u.end_time.slice(0, 5)}`
                      : "Journée"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-ink-3 font-bold">
                    {u.reason ? REASON_LABELS[u.reason] ?? u.reason : "—"}
                  </span>
                  {u.notes ? (
                    <span className="italic text-ink-3">"{u.notes}"</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
