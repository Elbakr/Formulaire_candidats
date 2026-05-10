// Server component that builds an employee timeline by combining:
// - hire event (synthesized from employees.start_date)
// - activity_log entries (target_type='employee')
// - approved time-off requests
// - evaluations created
// - shifts (no-shows + done)
//
// Mirrors the visual style of the candidate `timeline-panel.tsx` but is
// independent because the source tables differ.

import {
  Sparkles,
  Calendar as CalendarIcon,
  Star,
  AlertTriangle,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  type EvaluationRow,
  type ShiftRow,
  type TimeOffRow,
  type ActivityEntry,
} from "@/lib/profile360/build";

type EventType = "hire" | "activity" | "time_off" | "evaluation" | "shift_no_show" | "onboarding";

type TimelineItem = {
  id: string;
  type: EventType;
  when: string;
  headline: string;
  body?: string | null;
  meta?: string | null;
  actor?: string | null;
};

const VISUALS: Record<EventType, { Icon: typeof Sparkles; dot: string; chip: string; label: string }> = {
  hire: {
    Icon: Sparkles,
    dot: "bg-success",
    chip: "bg-success-light text-success",
    label: "Embauche",
  },
  activity: {
    Icon: RefreshCw,
    dot: "bg-info",
    chip: "bg-info-light text-info",
    label: "Activité",
  },
  time_off: {
    Icon: CalendarIcon,
    dot: "bg-warn",
    chip: "bg-warn-light text-warn",
    label: "Congé",
  },
  evaluation: {
    Icon: Star,
    dot: "bg-gold",
    chip: "bg-gold-light text-gold-dark",
    label: "Évaluation",
  },
  shift_no_show: {
    Icon: AlertTriangle,
    dot: "bg-danger",
    chip: "bg-danger-light text-danger",
    label: "No-show",
  },
  onboarding: {
    Icon: ClipboardCheck,
    dot: "bg-violet",
    chip: "bg-violet-light text-violet",
    label: "Onboarding",
  },
};

function dayKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(iso: string) {
  const today = new Date();
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, yesterday)) return "Hier";
  return formatDate(iso, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export async function EmployeeTimelinePanel({
  employeeId,
  startDate,
  evaluations,
  timeOff,
  activity,
}: {
  employeeId: string;
  startDate: string | null;
  evaluations: EvaluationRow[];
  timeOff: TimeOffRow[];
  activity: ActivityEntry[];
}) {
  const supabase = await createClient();

  // No-show shifts (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data: noShowsData } = await supabase
    .from("shifts")
    .select("id, date, start_time, end_time, status")
    .eq("employee_id", employeeId)
    .eq("status", "no_show")
    .gte("date", sinceISO)
    .order("date", { ascending: false })
    .limit(20);
  const noShows = (noShowsData ?? []) as unknown as Pick<
    ShiftRow,
    "id" | "date" | "start_time" | "end_time" | "status"
  >[];

  // Onboarding items recently completed (best-effort)
  const { data: runs } = await supabase
    .from("onboarding_runs")
    .select("id")
    .eq("employee_id", employeeId)
    .limit(1);
  const runId = (runs as Array<{ id: string }> | null)?.[0]?.id;
  let onbDone: Array<{ id: string; label: string; done_at: string }> = [];
  if (runId) {
    const { data: items } = await supabase
      .from("onboarding_run_items")
      .select("id, label, done_at")
      .eq("run_id", runId)
      .not("done_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(20);
    onbDone = (items ?? []) as unknown as Array<{ id: string; label: string; done_at: string }>;
  }

  const items: TimelineItem[] = [];

  if (startDate) {
    items.push({
      id: `hire-${employeeId}`,
      type: "hire",
      when: `${startDate}T08:00:00`,
      headline: "Date d'entrée",
      meta: formatDate(startDate),
    });
  }

  for (const a of activity) {
    items.push({
      id: `act-${a.id}`,
      type: "activity",
      when: a.created_at,
      headline: a.description ?? a.kind ?? "Activité",
      actor: a.actor_label,
      meta: a.kind ?? null,
    });
  }

  for (const t of timeOff) {
    if (t.status !== "approved") continue;
    items.push({
      id: `to-${t.id}`,
      type: "time_off",
      when: t.decided_at ?? `${t.start_date}T00:00:00`,
      headline: `Congé approuvé : ${t.kind ?? "Congé"}`,
      meta: `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`,
    });
  }

  for (const e of evaluations) {
    items.push({
      id: `eval-${e.id}`,
      type: "evaluation",
      when: e.created_at,
      headline: `Évaluation ${e.total != null ? `${Number(e.total).toFixed(1)} / 5` : ""}`,
      meta: `Période ${formatDate(e.period_start)} → ${formatDate(e.period_end)}`,
      actor: e.evaluator?.full_name ?? null,
      body: e.comment,
    });
  }

  for (const s of noShows) {
    items.push({
      id: `ns-${s.id}`,
      type: "shift_no_show",
      when: `${s.date}T${s.start_time}`,
      headline: "Shift en no-show",
      meta: `${s.start_time}–${s.end_time}`,
    });
  }

  for (const o of onbDone) {
    items.push({
      id: `onb-${o.id}`,
      type: "onboarding",
      when: o.done_at,
      headline: `Onboarding : ${o.label}`,
    });
  }

  items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  if (items.length === 0) {
    return (
      <Card>
        <div className="p-6 text-sm text-ink-3">Aucun événement pour cet employé.</div>
      </Card>
    );
  }

  // Group by day
  const groups = new Map<string, TimelineItem[]>();
  for (const it of items.slice(0, 80)) {
    const k = dayKey(it.when);
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }

  return (
    <Card>
      <div className="p-4">
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, dayItems]) => (
            <section key={day}>
              <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm py-1.5 mb-2 border-b border-line">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-ink-3">
                  {dayLabel(dayItems[0].when)}
                </h3>
              </div>
              <ul className="relative pl-6">
                <span aria-hidden className="absolute left-2 top-1 bottom-1 w-px bg-line" />
                {dayItems.map((it) => {
                  const v = VISUALS[it.type];
                  return (
                    <li key={it.id} className="relative pb-4 last:pb-0">
                      <span
                        aria-hidden
                        className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-surface ${v.dot}`}
                      />
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${v.chip}`}
                            >
                              <v.Icon className="h-3 w-3" />
                              {v.label}
                            </span>
                            <span className="text-sm font-semibold text-ink">{it.headline}</span>
                          </div>
                          {it.meta ? <div className="text-xs text-ink-2 mt-1">{it.meta}</div> : null}
                          {it.body ? (
                            <div className="text-sm text-ink-2 mt-1 italic whitespace-pre-wrap">
                              &ldquo;{it.body.slice(0, 220)}{it.body.length > 220 ? "…" : ""}&rdquo;
                            </div>
                          ) : null}
                          {it.actor ? <div className="text-[11px] text-ink-3 mt-1">par {it.actor}</div> : null}
                        </div>
                        <time
                          className="text-[11px] text-ink-3 whitespace-nowrap shrink-0"
                          dateTime={it.when}
                          title={formatDateTime(it.when)}
                        >
                          {formatDateTime(it.when)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Card>
  );
}
