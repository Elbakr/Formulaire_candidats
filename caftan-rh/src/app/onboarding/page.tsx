import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { OnboardingListRefresher } from "./list-refresher";

type RunRow = {
  id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
  employee: {
    id: string;
    full_name: string;
    job_title: string | null;
    start_date: string;
    status: string;
    department: { id: string; name: string } | null;
  } | null;
};

type ItemAgg = {
  run_id: string;
  total: number;
  done: number;
  required: number;
  required_done: number;
};

export default async function OnboardingHomePage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: runsData } = await supabase
    .from("onboarding_runs")
    .select(
      `id, employee_id, started_at, completed_at,
       employee:employees(id, full_name, job_title, start_date, status,
         department:departments(id, name))`,
    )
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("started_at", { ascending: false });
  const runs = (runsData ?? []) as unknown as RunRow[];

  const runIds = runs.map((r) => r.id);
  let aggMap = new Map<string, ItemAgg>();
  if (runIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("onboarding_run_items")
      .select("run_id, done_at, is_required")
      .in("run_id", runIds);
    const items = (itemsData ?? []) as unknown as Array<{ run_id: string; done_at: string | null; is_required: boolean }>;
    aggMap = items.reduce((acc, it) => {
      const cur = acc.get(it.run_id) ?? { run_id: it.run_id, total: 0, done: 0, required: 0, required_done: 0 };
      cur.total += 1;
      if (it.done_at) cur.done += 1;
      if (it.is_required) {
        cur.required += 1;
        if (it.done_at) cur.required_done += 1;
      }
      acc.set(it.run_id, cur);
      return acc;
    }, new Map<string, ItemAgg>());
  }

  const now = Date.now();

  const active = runs.filter((r) => !r.completed_at);
  const closed = runs.filter((r) => !!r.completed_at);

  return (
    <div className="space-y-4">
      <OnboardingListRefresher />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Onboarding équipe</h1>
          <p className="text-sm text-ink-2">
            {active.length} en cours · {closed.length} terminé·s
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-ink-2" />
          <h2 className="font-bold text-sm">En cours ({active.length})</h2>
        </div>
        {active.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun onboarding en cours. Quand un nouvel employé est créé, il apparaîtra ici automatiquement.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {active.map((r) => {
              const agg = aggMap.get(r.id);
              const total = agg?.total ?? 0;
              const done = agg?.done ?? 0;
              const pct = total === 0 ? 0 : Math.round((done / total) * 100);
              const days = r.employee?.start_date
                ? Math.max(0, Math.floor((now - new Date(r.employee.start_date).getTime()) / 86400000))
                : 0;
              return (
                <Link
                  key={r.id}
                  href={`/onboarding/${r.employee_id}`}
                  className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
                >
                  <NameAvatar name={r.employee?.full_name ?? "—"} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{r.employee?.full_name ?? "—"}</div>
                    <div className="text-xs text-ink-3 truncate">
                      {r.employee?.job_title ?? "—"} · {r.employee?.department?.name ?? "Sans service"} · J+{days}
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                  <div className="hidden md:flex flex-col items-end text-xs text-ink-3 mr-2">
                    <span className="font-mono font-bold text-ink-2">{done}/{total}</span>
                    <span>débuté {formatDate(r.started_at)}</span>
                  </div>
                  <PctBadge pct={pct} />
                  <ArrowRight className="h-4 w-4 text-ink-3 ml-1" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {closed.length > 0 ? (
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <h2 className="font-bold text-sm">Terminés ({closed.length})</h2>
          </div>
          <div className="divide-y divide-line">
            {closed.map((r) => {
              const agg = aggMap.get(r.id);
              const total = agg?.total ?? 0;
              const done = agg?.done ?? 0;
              return (
                <Link
                  key={r.id}
                  href={`/onboarding/${r.employee_id}`}
                  className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
                >
                  <NameAvatar name={r.employee?.full_name ?? "—"} className="opacity-60" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{r.employee?.full_name ?? "—"}</div>
                    <div className="text-xs text-ink-3 truncate">
                      {r.employee?.job_title ?? "—"} · clôturé {r.completed_at ? formatDate(r.completed_at) : "—"}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-ink-3 mr-2">{done}/{total}</span>
                  <Badge variant="hired">Terminé</Badge>
                  <ArrowRight className="h-4 w-4 text-ink-3 ml-1" />
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
      <div
        className={pct >= 100 ? "h-full bg-success" : pct >= 50 ? "h-full bg-gold" : "h-full bg-warn"}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function PctBadge({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? "bg-success-light text-success" :
    pct >= 75 ? "bg-gold-light text-gold-dark" :
    pct >= 40 ? "bg-warn-light text-warn" :
    "bg-danger-light text-danger";
  return (
    <div className={`rounded-md px-2.5 py-1 font-mono font-extrabold text-sm ${color}`}>
      {pct}%
    </div>
  );
}
