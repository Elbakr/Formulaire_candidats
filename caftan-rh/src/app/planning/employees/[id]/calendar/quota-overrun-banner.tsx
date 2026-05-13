"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reclassifyExcessAsOvertimeAction } from "@/app/planning/actions";

export function QuotaOverrunBanner({
  employeeId,
  employeeName,
  weekISO,
  contractHours,
  weeklyTarget,
}: {
  employeeId: string;
  employeeName: string;
  weekISO: string;
  contractHours: number;
  weeklyTarget: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const excess = contractHours - weeklyTarget;
  if (excess <= 0.01) return null;

  function reclassify(mult: number) {
    startTransition(async () => {
      const r = await reclassifyExcessAsOvertimeAction({
        employeeId,
        weekISO,
        multiplier: mult,
      });
      if (r?.error) {
        toast.error(r.error);
      } else {
        toast.success(
          `${r.reclassified} shift${(r.reclassified ?? 0) > 1 ? "s" : ""} reclassé${(r.reclassified ?? 0) > 1 ? "s" : ""} en OT ×${mult} (${(r.hoursReclassified ?? 0).toFixed(1)}h)`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-danger bg-danger-light/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-danger">
            {contractHours.toFixed(1)}h contractuelles vs cible {weeklyTarget}h
            <span className="ml-1 font-mono">(+{excess.toFixed(1)}h non taguées OT)</span>
          </div>
          <div className="text-xs text-ink-2 mt-0.5">
            Le surplus n&apos;est pas marqué comme heures sup. Reclasse les{" "}
            {excess.toFixed(1)}h excédentaires (shifts les plus récents) en OT pour
            que la paie et les KPI soient corrects pour {employeeName}.
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => reclassify(1.25)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-line bg-surface hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3 text-orange-600" />}
              Reclasser en OT ×1.25
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => reclassify(1.5)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-orange-400 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3 text-orange-600" />}
              Reclasser en OT ×1.5 (Recommandé)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => reclassify(2.0)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-line bg-surface hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3 text-orange-600" />}
              Reclasser en OT ×2
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
