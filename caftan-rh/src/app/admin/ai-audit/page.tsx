// AI audit dashboard.
//
// - Last 30 days : # calls per task, total cost, error rate
// - Provider / models in use
// - Toggle autonomy_level (0/1/2/3)
// - Budget remaining

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AiSettingsForm } from "./ai-settings-form";

type AuditRow = {
  task: string;
  success: boolean | null;
  cost_usd: number | null;
  cached: boolean | null;
  duration_ms: number | null;
  created_at: string;
};

type OrgSettings = {
  ai_autonomy_level: number | null;
  ai_provider: string | null;
  ai_model_strong: string | null;
  ai_model_fast: string | null;
  ai_budget_usd_monthly: number | null;
};

function startOfMonthIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

export default async function AiAuditPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const sinceMonth = startOfMonthIso();

  const [{ data: audit30d }, { data: auditMonth }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("ai_audit")
      .select("task, success, cost_usd, cached, duration_ms, created_at")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_audit")
      .select("cost_usd, success, cached")
      .gte("created_at", sinceMonth),
    supabase
      .from("org_settings")
      .select("ai_autonomy_level, ai_provider, ai_model_strong, ai_model_fast, ai_budget_usd_monthly")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const rows = (audit30d ?? []) as AuditRow[];
  const monthRows = (auditMonth ?? []) as Pick<AuditRow, "cost_usd" | "success" | "cached">[];

  // Per-task aggregates
  const byTask = new Map<string, { calls: number; cost: number; errors: number; cached: number }>();
  for (const r of rows) {
    const cur = byTask.get(r.task) ?? { calls: 0, cost: 0, errors: 0, cached: 0 };
    cur.calls += 1;
    cur.cost += Number(r.cost_usd ?? 0);
    if (!r.success) cur.errors += 1;
    if (r.cached) cur.cached += 1;
    byTask.set(r.task, cur);
  }

  const totalCalls30d = rows.length;
  const totalErrors30d = rows.filter((r) => !r.success).length;
  const totalCost30d = rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
  const errorRatePct = totalCalls30d === 0 ? 0 : (totalErrors30d / totalCalls30d) * 100;

  const totalCostMonth = monthRows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
  const settings: OrgSettings = (settingsRow ?? {
    ai_autonomy_level: 0,
    ai_provider: "anthropic",
    ai_model_strong: "claude-sonnet-4-6",
    ai_model_fast: "claude-haiku-4-5-20251001",
    ai_budget_usd_monthly: 50,
  }) as OrgSettings;

  const budgetUsed = totalCostMonth;
  const budget = Number(settings.ai_budget_usd_monthly ?? 0);
  const budgetRemaining = Math.max(0, budget - budgetUsed);
  const budgetPct = budget > 0 ? Math.min(100, (budgetUsed / budget) * 100) : 0;

  const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit IA</h1>
        <p className="text-sm text-ink-2">
          Suivi des appels IA, coût, qualité, autonomie. Données agrégées sur 30 jours.
        </p>
      </div>

      {!apiKeyConfigured ? (
        <div className="rounded-md border border-warn-light bg-warn-light/40 p-3 text-xs text-warn">
          ⚠ <code>ANTHROPIC_API_KEY</code> non configurée. Les appels retournent immédiatement{" "}
          <code>{"{ ok: false }"}</code> sans crash, et l&apos;Inbox affiche les actions de démo seedées.
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Appels 30j" value={totalCalls30d.toString()} />
        <Stat label="Coût 30j" value={`$${totalCost30d.toFixed(4)}`} />
        <Stat label="Coût mois" value={`$${totalCostMonth.toFixed(4)}`} />
        <Stat
          label="Taux d'erreur"
          value={`${errorRatePct.toFixed(1)}%`}
          tone={errorRatePct > 10 ? "danger" : errorRatePct > 3 ? "warn" : "ok"}
        />
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Budget mensuel</h2>
        </div>
        <div className="p-4 space-y-2">
          <div className="text-sm">
            <strong>${budgetUsed.toFixed(4)}</strong> utilisés / ${budget.toFixed(2)} —
            reste <strong>${budgetRemaining.toFixed(4)}</strong>
          </div>
          <div className="h-2 bg-line rounded-full overflow-hidden">
            <div
              className={`h-full ${budgetPct > 90 ? "bg-danger" : budgetPct > 70 ? "bg-warn" : "bg-success"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Par tâche (30j)</h2>
        </div>
        {byTask.size === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun appel IA loggé sur les 30 derniers jours.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-[10px] uppercase tracking-wider text-ink-3">
                <th className="text-left p-2 font-bold">Tâche</th>
                <th className="text-right p-2 font-bold">Appels</th>
                <th className="text-right p-2 font-bold">Cache</th>
                <th className="text-right p-2 font-bold">Erreurs</th>
                <th className="text-right p-2 font-bold">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Array.from(byTask.entries())
                .sort((a, b) => b[1].calls - a[1].calls)
                .map(([task, m]) => (
                  <tr key={task}>
                    <td className="p-2 font-bold">{task}</td>
                    <td className="p-2 text-right font-mono">{m.calls}</td>
                    <td className="p-2 text-right font-mono">{m.cached}</td>
                    <td className="p-2 text-right font-mono">{m.errors}</td>
                    <td className="p-2 text-right font-mono">${m.cost.toFixed(4)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Configuration IA</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Provider et modèles utilisés. Niveau d&apos;autonomie : 0 (suggestion uniquement) →
            3 (autonome).
          </p>
        </div>
        <AiSettingsForm initial={settings} />
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-success"
          : "text-ink";
  return (
    <div className="rounded-[var(--radius)] bg-surface border border-line p-3">
      <div className={`text-2xl font-extrabold font-mono leading-none ${cls}`}>{value}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-bold text-ink-3">{label}</div>
    </div>
  );
}
