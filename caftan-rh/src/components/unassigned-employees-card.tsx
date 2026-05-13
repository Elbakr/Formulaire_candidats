"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { assignEmployeeToSiteAction } from "@/app/planning/employees/[id]/site-actions";

type UnassignedEmp = {
  id: string;
  full_name: string;
  contract_type: string | null;
  weekly_hours: number | null;
};

type SiteDeficit = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  deficit_hours: number;
  band: "danger" | "warn" | "ok" | "over";
};

export function UnassignedEmployeesCard({
  employees,
  sitesInDeficit,
}: {
  employees: UnassignedEmp[];
  sitesInDeficit: SiteDeficit[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Sites a suggerer en priorite : les plus en deficit d'abord
  const suggested = sitesInDeficit
    .filter((s) => s.deficit_hours > 0)
    .sort((a, b) => b.deficit_hours - a.deficit_hours)
    .slice(0, 3);

  function onAssign(employeeId: string, siteId: string, siteCode: string) {
    const today = new Date().toISOString().slice(0, 10);
    setBusyId(`${employeeId}-${siteId}`);
    startTransition(async () => {
      const r = await assignEmployeeToSiteAction({
        employeeId,
        siteId,
        startDate: today,
        isPrimary: true,
        pct: 100,
      });
      setBusyId(null);
      if (r?.error) {
        toast.error(r.error);
      } else {
        toast.success(`Affecté au site ${siteCode}.`);
        router.refresh();
      }
    });
  }

  if (employees.length === 0) return null;

  return (
    <Card className="border-warn">
      <div className="px-3 py-2 border-b border-warn/40 bg-warn-light/40 flex items-center gap-2 flex-wrap">
        <UserPlus className="h-4 w-4 text-warn shrink-0" />
        <h2 className="font-bold text-sm">
          {employees.length} employé{employees.length > 1 ? "s" : ""} sans site affecté
        </h2>
        {suggested.length > 0 ? (
          <span className="text-[11px] text-ink-2 ml-auto">
            {suggested.length} site{suggested.length > 1 ? "s" : ""} en déficit à couvrir en priorité
          </span>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {employees.map((e) => (
          <li key={e.id} className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Link
                href={`/planning/employees/${e.id}`}
                className="font-bold text-sm hover:underline"
              >
                {e.full_name}
              </Link>
              <div className="text-[11px] text-ink-3">
                {e.contract_type ?? "—"} · {e.weekly_hours ?? 38}h/sem
              </div>
            </div>
            {suggested.length > 0 ? (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-ink-3 mr-1">Affecter :</span>
                {suggested.map((s) => {
                  const busy = busyId === `${e.id}-${s.id}`;
                  return (
                    <Button
                      key={s.id}
                      size="sm"
                      variant="outline"
                      onClick={() => onAssign(e.id, s.id, s.code)}
                      disabled={pending}
                      title={`${s.name} · manque ${s.deficit_hours.toFixed(1)}h cette semaine`}
                      className="text-[11px] h-7 px-2"
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <span
                          className="inline-flex items-center justify-center px-1 mr-1 rounded text-white text-[9px] font-bold"
                          style={{ backgroundColor: s.color ?? "#666" }}
                        >
                          {s.code}
                        </span>
                      )}
                      <span className={s.band === "danger" ? "text-danger font-bold" : ""}>
                        {s.deficit_hours > 0 ? `+${s.deficit_hours.toFixed(0)}h` : ""}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] text-ink-3 italic">Aucun site en déficit cette semaine</span>
            )}
            <Link
              href={`/planning/employees/${e.id}`}
              className="text-[11px] text-gold-dark hover:underline inline-flex items-center gap-1"
              title="Affectation détaillée"
            >
              Autre site <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
      {suggested.length === 0 ? (
        <div className="px-3 py-2 text-[10px] text-ink-3 italic flex items-center gap-1 bg-surface-2/30">
          <AlertTriangle className="h-3 w-3" />
          Aucun site n'a de déficit actuellement. Affecte manuellement via la fiche employé.
        </div>
      ) : null}
    </Card>
  );
}
