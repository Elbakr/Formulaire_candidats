import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeaveRulesForm } from "./leave-rules-form";
import { previewAutoValidationStats } from "./actions";

export default async function LeaveRulesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select(
      "leave_auto_min_notice_days, leave_auto_max_pct_absents_per_site, leave_auto_max_consecutive_days, leave_blocked_periods",
    )
    .eq("id", 1)
    .maybeSingle();
  const r = data as unknown as {
    leave_auto_min_notice_days: number | null;
    leave_auto_max_pct_absents_per_site: number | null;
    leave_auto_max_consecutive_days: number | null;
    leave_blocked_periods: string[] | null;
  } | null;

  const initial = {
    min_notice_days: r?.leave_auto_min_notice_days ?? 14,
    max_pct_absents: r?.leave_auto_max_pct_absents_per_site ?? 30,
    max_consecutive: r?.leave_auto_max_consecutive_days ?? 10,
    blocked_periods: Array.isArray(r?.leave_blocked_periods)
      ? r!.leave_blocked_periods!
      : ["sales", "ramadan_aid", "year_end", "wed_sat"],
  };

  // Aperçu rétrospectif (30 derniers jours, jusqu'à 200 demandes max).
  let stats: Awaited<ReturnType<typeof previewAutoValidationStats>> | null = null;
  try {
    stats = await previewAutoValidationStats();
  } catch {
    stats = null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Auto-validation des congés</h1>
          <p className="text-sm text-ink-2">
            Quand toutes les règles passent, la demande est validée sans intervention
            humaine. Sinon, le manager est notifié avec la raison de l'escalade.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/settings">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paramètres
          </Link>
        </Button>
      </div>

      <Card>
        <LeaveRulesForm initial={initial} />
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Aperçu rétrospectif (30 derniers jours)</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Calcul sur les demandes récentes en rejouant les règles actuelles.
            Estimation à titre indicatif.
          </p>
        </div>
        <div className="p-4">
          {stats ? (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Demandes analysées" value={stats.total} />
              <Stat
                label="Auto-validées"
                value={stats.wouldAutoApprove}
                tone="success"
              />
              <Stat label="Escaladées manager" value={stats.wouldEscalate} tone="warn" />
            </div>
          ) : (
            <p className="text-sm text-ink-3">Aucune donnée disponible.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warn";
}) {
  const toneCls =
    tone === "success"
      ? "bg-success-light text-success"
      : tone === "warn"
        ? "bg-warn-light text-warn"
        : "bg-surface-2 text-ink-2";
  return (
    <div className={`rounded-md p-3 ${toneCls}`}>
      <div className="text-2xl font-extrabold font-mono">{value}</div>
      <div className="text-[11px] uppercase tracking-wider font-bold mt-0.5">{label}</div>
    </div>
  );
}
