import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { loadQuotaForEmployee } from "@/lib/quotas";

function progressTone(progress: number): { bar: string; text: string } {
  if (progress > 1.0001) return { bar: "bg-danger", text: "text-danger" };
  if (progress >= 0.9) return { bar: "bg-warn", text: "text-warn" };
  return { bar: "bg-success", text: "text-success" };
}

function ProgressLine({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number | null;
}) {
  if (target == null || target <= 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-1 text-[11px]">
          <span className="text-ink-3 uppercase tracking-wider font-bold text-[10px]">
            {label}
          </span>
          <span className="text-ink-3 italic">N/A</span>
        </div>
      </div>
    );
  }
  const pct = (value / target) * 100;
  const tone = progressTone(value / target);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-1 text-[11px]">
        <span className="text-ink-3 uppercase tracking-wider font-bold text-[10px]">
          {label}
        </span>
        <span>
          <span className={`font-mono font-bold ${tone.text}`}>{value.toFixed(1)}h</span>
          <span className="text-ink-3 font-mono"> / {target.toFixed(0)}h</span>
        </span>
      </div>
      <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(120, pct)}%` }} />
      </div>
    </div>
  );
}

export async function EmployeeQuotaCard({ employeeId }: { employeeId: string }) {
  const q = await loadQuotaForEmployee(employeeId);
  return (
    <Card>
      <div className="p-4 border-b border-line">
        <h2 className="font-bold flex items-center gap-2">
          <Activity className="h-4 w-4 text-gold-dark" />
          Quotas en cours
        </h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Heures planifiées vs cibles. Anticipation S+1 indicative.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <ProgressLine label="Semaine" value={q.weekHours} target={q.weekTarget} />
        <ProgressLine label="Mois" value={q.monthHours} target={q.monthTarget} />
        <ProgressLine label="Année (si étudiant)" value={q.yearHours} target={q.yearTarget} />
        <div className="flex items-baseline justify-between gap-1 text-[11px] pt-1 border-t border-line">
          <span className="text-ink-3 uppercase tracking-wider font-bold text-[10px]">
            Anticipation S+1
          </span>
          <span className="font-mono font-bold">{q.nextWeekHours.toFixed(1)}h</span>
        </div>
      </div>
    </Card>
  );
}
