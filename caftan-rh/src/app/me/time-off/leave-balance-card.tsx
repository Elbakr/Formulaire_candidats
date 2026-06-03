// Karim 2026-06-03 : card affichant le solde congés payés du worker
// pour l'année courante. Server component fetch direct.

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CalendarDays, Info } from "lucide-react";

export async function LeaveBalanceCard() {
  await requireUser();
  const supa = await (await import("@/lib/supabase/server")).createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, contract_type")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!emp) return null;

  const isStudent = (emp.contract_type as string | null) === "Étudiant" || (emp.contract_type as string | null) === "Student";
  if (isStudent) {
    return (
      <Card className="p-4 bg-blue-50/30 border-blue-200">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-900">
            <strong>Étudiant·e</strong> — Les jobs étudiants ne donnent pas droit à des congés payés
            par l&apos;employeur (régime spécial étudiant). Tu peux toutefois signaler une absence
            via la page dédiée.
          </div>
        </div>
      </Card>
    );
  }

  const year = new Date().getFullYear();
  const { data: balance } = await admin
    .from("leave_balances")
    .select("base_days, sector_extra, carry_over, prorata_factor, total_allocated, used_days, pending_days, remaining_days, computation_note, computed_at")
    .eq("employee_id", (emp as { id: string }).id)
    .eq("year", year)
    .maybeSingle();

  if (!balance) {
    return (
      <Card className="p-4 bg-muted/30">
        <div className="text-xs text-ink-3 italic">
          Solde congés non encore calculé pour {year}. Sera disponible après le prochain calcul auto (hebdomadaire) ou demande au RH de relancer.
        </div>
      </Card>
    );
  }

  const b = balance as {
    base_days: number; sector_extra: number; carry_over: number; prorata_factor: number;
    total_allocated: number; used_days: number; pending_days: number; remaining_days: number;
    computation_note: string | null; computed_at: string;
  };

  const total = Number(b.total_allocated);
  const used = Number(b.used_days);
  const pending = Number(b.pending_days);
  const remaining = Number(b.remaining_days);
  const usedPct = total > 0 ? (used / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gold" />
          <span className="font-semibold text-sm">Solde congés payés {year}</span>
        </div>
        <span className="text-[10px] text-ink-3">
          MAJ {new Date(b.computed_at).toLocaleDateString("fr-BE")}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-bold text-green-700">{remaining.toFixed(1)}</div>
          <div className="text-[10px] text-ink-3">Restants</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-600">{pending.toFixed(1)}</div>
          <div className="text-[10px] text-ink-3">En attente</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-ink-3">{used.toFixed(1)}</div>
          <div className="text-[10px] text-ink-3">Pris / validés</div>
        </div>
      </div>

      {/* Bar de progression */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-ink-3">
          <span>0 j</span>
          <span>Total alloué : <strong>{total.toFixed(1)} j</strong></span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div className="bg-ink-3" style={{ width: `${usedPct}%` }} title={`${used.toFixed(1)} j pris`} />
          <div className="bg-amber-400" style={{ width: `${pendingPct}%` }} title={`${pending.toFixed(1)} j en attente`} />
        </div>
      </div>

      {b.computation_note && (
        <div className="text-[10px] text-ink-3 italic flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {b.computation_note} — Base légale BE {b.base_days} j × prorata {(Number(b.prorata_factor) * 100).toFixed(0)}%
          {Number(b.sector_extra) > 0 ? ` + ${b.sector_extra} j sectoriel CCT` : ""}
        </div>
      )}
    </Card>
  );
}
