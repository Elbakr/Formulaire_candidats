import { ShieldCheck, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { startOfWeek, addDays, toISODate, parseISODate } from "@/lib/planning";
import {
  detectRushWeek,
  type RushHoliday,
  type RushSeasonalEvent,
} from "@/lib/validation/rush-detection";
import { CreateRunForm } from "./create-run-form";
import { RunsList, type RunWithStats } from "./runs-list";

export const dynamic = "force-dynamic";

export default async function ValidationPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const today = new Date();
  const thisMonday = startOfWeek(today);
  const nextMonday = addDays(thisMonday, 7);
  const fourWeeksAhead = addDays(thisMonday, 28);

  // Charge les holidays + seasonal_events des 4 prochaines semaines pour pre-detecter le rush.
  const [{ data: runsRaw }, { data: holidaysRaw }, { data: seasonalRaw }, { data: respCountsRaw }] = await Promise.all([
    supabase
      .from("planning_validation_runs")
      .select("id, week_iso, site_id, created_by, created_at, deadline_at, obligation_reason, was_mandatory, was_bypassed, bypass_reason, status")
      .gte("week_iso", toISODate(addDays(thisMonday, -28)))
      .order("week_iso", { ascending: false }),
    supabase
      .from("holidays")
      .select("date, priority, kind, shops_closed, staff_multiplier")
      .gte("date", toISODate(thisMonday))
      .lte("date", toISODate(fourWeeksAhead)),
    supabase
      .from("seasonal_events")
      .select("id, kind, start_date, end_date, label")
      .lte("start_date", toISODate(fourWeeksAhead))
      .gte("end_date", toISODate(thisMonday)),
    supabase
      .from("planning_validation_responses")
      .select("run_id, response, cancelled_after_validation"),
  ]);

  const holidays = (holidaysRaw ?? []) as RushHoliday[];
  const seasonal = (seasonalRaw ?? []) as RushSeasonalEvent[];

  // Detecte le rush pour les 4 prochaines semaines (utile UI : encourager creation auto)
  const upcomingWeeks = [thisMonday, nextMonday, addDays(thisMonday, 14), addDays(thisMonday, 21)].map((w) => {
    const iso = toISODate(w);
    return { mondayISO: iso, rush: detectRushWeek(iso, holidays, seasonal) };
  });

  // Stats par run
  const responses = (respCountsRaw ?? []) as Array<{ run_id: string; response: string | null; cancelled_after_validation: boolean }>;
  const statsByRun = new Map<string, { accepted: number; refused: number; pending: number; cancelled: number }>();
  for (const r of responses) {
    const s = statsByRun.get(r.run_id) ?? { accepted: 0, refused: 0, pending: 0, cancelled: 0 };
    if (r.cancelled_after_validation) s.cancelled += 1;
    else if (r.response === "accepted") s.accepted += 1;
    else if (r.response === "refused") s.refused += 1;
    else s.pending += 1;
    statsByRun.set(r.run_id, s);
  }

  const runs = ((runsRaw ?? []) as Array<{
    id: string;
    week_iso: string;
    site_id: string | null;
    created_by: string | null;
    created_at: string;
    deadline_at: string | null;
    obligation_reason: string | null;
    was_mandatory: boolean;
    was_bypassed: boolean;
    bypass_reason: string | null;
    status: "pending" | "closed" | "cancelled";
  }>).map<RunWithStats>((r) => ({
    ...r,
    stats: statsByRun.get(r.id) ?? { accepted: 0, refused: 0, pending: 0, cancelled: 0 },
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Validation planning par les employés
        </h1>
        <p className="text-sm text-ink-2 max-w-3xl">
          Le RH peut activer une demande de validation par les employés des
          plannings générés. Cette activation est facultative en temps normal,
          mais devient <strong>obligatoire</strong> avant chaque grand rush
          (vacances scolaires, jours fériés internationaux, 15 derniers jours
          du Ramadan, jours fériés qui bordent le weekend). L obligation reste
          bypassable en cas de besoin urgent d application du planning.
        </p>
      </div>

      {/* Vue 4 semaines : signale les rush a venir */}
      <Card>
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" />
            Semaines à venir — détection de rush automatique
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Les semaines marquées en orange déclenchent l obligation de validation.
            Tu peux créer le run depuis le formulaire ci-dessous.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {upcomingWeeks.map((w) => {
            const monday = parseISODate(w.mondayISO);
            const sunday = addDays(monday, 6);
            const existing = runs.find((r) => r.week_iso === w.mondayISO);
            return (
              <li key={w.mondayISO} className="px-4 py-2 flex items-center gap-3 text-sm flex-wrap">
                <div className="font-mono font-bold w-24 shrink-0">{w.mondayISO}</div>
                <div className="text-ink-2 w-44 shrink-0 text-[12px]">
                  {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                  {" → "}
                  {sunday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                </div>
                {w.rush.isRush ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn-light text-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-warn/30">
                    <AlertTriangle className="h-3 w-3" />
                    Rush — obligation
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 text-ink-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Normal
                  </span>
                )}
                {w.rush.reasons.length > 0 ? (
                  <span className="text-[11px] text-ink-2 italic max-w-md truncate" title={w.rush.reasons.join(" | ")}>
                    {w.rush.reasons.join(" • ")}
                  </span>
                ) : null}
                <span className="ml-auto text-[11px]">
                  {existing ? (
                    <span className="font-bold text-success">
                      Run actif ({existing.status})
                    </span>
                  ) : (
                    <span className="text-ink-3">pas de run</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Formulaire creation run */}
      <Card>
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-sm">Créer une demande de validation</h2>
        </div>
        <CreateRunForm defaultWeekISO={toISODate(thisMonday)} />
      </Card>

      {/* Liste des runs */}
      <Card>
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-sm">Demandes de validation</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Liste des runs des 4 dernières semaines + à venir. Statistiques : acceptés / refusés / en attente / annulés après validation.
          </p>
        </div>
        <RunsList runs={runs} />
      </Card>
    </div>
  );
}
