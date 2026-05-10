import Link from "next/link";
import { ArrowRight, AlertCircle, AlertTriangle, Star } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import {
  fetchTopPerformers,
  fetchAtRisk,
  fetchUpcomingCddEnds,
  fetchUnusualAbsenteeism,
} from "@/lib/performance-shared";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ManagerPerformancePage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const managerId = profile.role === "manager" ? profile.id : null;

  const [top, atRisk, cdd, abs] = await Promise.all([
    fetchTopPerformers(supabase, { managerId, limit: 5 }),
    fetchAtRisk(supabase, { managerId, limit: 5 }),
    fetchUpcomingCddEnds(supabase, { managerId, limit: 10 }),
    fetchUnusualAbsenteeism(supabase, { managerId, limit: 5 }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Performance — mon magasin</h1>
        <p className="text-sm text-ink-2">
          Vue synthétique des employés sous ta responsabilité.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2"><Star className="h-4 w-4 fill-gold text-gold" /> Top 5 performers</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/scoring">Tout voir <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
          {top.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Pas encore de score calculé.</div>
          ) : (
            <ul className="divide-y divide-line">
              {top.map((s, i) => (
                <li key={s.employee_id} className="flex items-center gap-3 p-3">
                  <div className="w-6 text-center font-mono font-bold text-ink-3 shrink-0">#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={s.employee_id}
                      fullName={s.full_name}
                      variant="block"
                      fullWidth
                      subtitle={s.job_title ?? undefined}
                      primaryHref={`/scoring/${s.employee_id}`}
                    />
                  </div>
                  <div className="font-mono font-extrabold text-gold-dark shrink-0">{Number(s.global_score ?? 0).toFixed(0)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" /> À risque</h2>
            <p className="text-xs text-ink-3 mt-0.5">Score inférieur à 60.</p>
          </div>
          {atRisk.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Personne à risque. Bien joué !</div>
          ) : (
            <ul className="divide-y divide-line">
              {atRisk.map((r) => (
                <li key={r.employee_id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={r.employee_id}
                      fullName={r.full_name}
                      variant="block"
                      fullWidth
                      subtitle={r.reasons.join(" · ")}
                      primaryHref={`/scoring/${r.employee_id}`}
                    />
                  </div>
                  <div className="font-mono font-bold text-danger shrink-0">{Number(r.global_score ?? 0).toFixed(0)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2"><AlertCircle className="h-4 w-4 text-warn" /> CDD fin période ≤ 30j</h2>
            {profile.role !== "manager" ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/cdd-renewals">Décider <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            ) : null}
          </div>
          {cdd.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Pas de CDD à échéance proche.</div>
          ) : (
            <ul className="divide-y divide-line">
              {cdd.map((c) => (
                <li key={c.employee_id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={c.employee_id}
                      fullName={c.full_name}
                      variant="block"
                      fullWidth
                      subtitle={`Fin contrat ${formatDate(c.end_date)} · J-${c.days_remaining}`}
                    />
                  </div>
                  {c.has_pending ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-info-light text-info shrink-0">
                      Fiche prête
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-warn-light text-warn shrink-0">
                      Aucune fiche
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> Absentéisme anormal</h2>
            <p className="text-xs text-ink-3 mt-0.5">Plus de 3 absences imprévues sur 60 jours.</p>
          </div>
          {abs.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Aucun signal anormal.</div>
          ) : (
            <ul className="divide-y divide-line">
              {abs.map((a) => (
                <li key={a.employee_id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={a.employee_id}
                      fullName={a.full_name}
                      variant="block"
                      fullWidth
                      subtitle={`${a.absence_count} absence${a.absence_count > 1 ? "s" : ""} en 60 jours`}
                    />
                  </div>
                  <div className="font-mono font-bold text-danger shrink-0">{a.absence_count}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
