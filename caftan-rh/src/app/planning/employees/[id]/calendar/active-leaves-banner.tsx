// Banniere "Conges actifs" sur la fiche calendar de l employe. Affiche TOUS
// les conges status=approved/pending dont la fin >= aujourd hui (y compris
// les conges ouverts 9999-12-31). Permet la cloture (date precise) ou
// l annulation totale. Karim 2026-05-21 : il a decouvert qu Omaima avait un
// conge "sans fin" residuel qui bloquait le solver.

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ActiveLeavesList } from "./active-leaves-list";

export async function ActiveLeavesBanner({ employeeId }: { employeeId: string }) {
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("time_off_requests")
    .select("id, kind, start_date, end_date, status, reason, auto_validation_reason, created_at")
    .eq("employee_id", employeeId)
    .in("status", ["approved", "pending"])
    .gte("end_date", todayISO)
    .order("start_date");

  type Leave = {
    id: string;
    kind: string;
    start_date: string;
    end_date: string;
    status: string;
    reason: string | null;
    auto_validation_reason: string | null;
    created_at: string;
  };
  const leaves = ((data ?? []) as Leave[]);
  if (leaves.length === 0) return null;

  // Detection conge "ouvert" (9999-12-31) ou tres long (> 90 jours)
  const hasOpenEnded = leaves.some((l) => l.end_date >= "9000-01-01");
  const hasMultiple = leaves.length > 1;

  return (
    <Card className={`border-l-4 ${hasOpenEnded ? "border-l-danger bg-danger-light/30" : "border-l-warn bg-warn-light/30"}`}>
      <div className="p-3">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertTriangle className={`h-4 w-4 ${hasOpenEnded ? "text-danger" : "text-warn"}`} />
          {leaves.length === 1 ? "Congé actif" : `${leaves.length} congés actifs`}
          {hasOpenEnded ? <span className="text-danger">— SANS FIN PROGRAMMÉE</span> : null}
        </div>
        {hasOpenEnded ? (
          <p className="text-[11px] text-ink-2 mt-0.5">
            ⚠ Un congé "ouvert" (sans fin) bloque la génération auto sur toute
            la période. Clôture-le ou annule-le pour libérer le solver.
          </p>
        ) : null}
        {hasMultiple ? (
          <p className="text-[11px] text-ink-2 mt-0.5">
            Plusieurs congés se chevauchent. Vérifie qu'il n'y a pas de doublon
            résiduel.
          </p>
        ) : null}
        <ActiveLeavesList leaves={leaves} todayISO={todayISO} />
      </div>
    </Card>
  );
}
