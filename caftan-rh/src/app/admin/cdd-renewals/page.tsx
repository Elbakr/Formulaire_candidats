import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RenewalCard, type RenewalCardProps } from "./renewal-card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Trend = "+" | "=" | "-";

type RawRow = {
  id: string;
  employee_id: string;
  contract_end_date: string;
  prepared_at: string;
  recommendation: "renew" | "do_not_renew" | "discuss";
  rationale: string;
  global_score: number | null;
  trends: RenewalCardProps["trends"] | null;
  site_load_forecast: Record<string, "under_staffed" | "balanced" | "over_staffed"> | null;
  status: RenewalCardProps["status"];
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  employees: { full_name: string; job_title: string | null } | null;
};

function daysBetween(today: Date, target: string): number {
  const t = new Date(target);
  return Math.ceil((t.getTime() - today.getTime()) / 86_400_000);
}

function toCardProps(r: RawRow, today: Date): RenewalCardProps {
  const fallbackTrends: RenewalCardProps["trends"] = {
    ponctualite_30d: "=",
    fiabilite_30d: "=",
    rating_30d: "=",
    absences_30d: "=",
  };
  return {
    recommendationId: r.id,
    employeeId: r.employee_id,
    fullName: r.employees?.full_name ?? "—",
    jobTitle: r.employees?.job_title ?? null,
    contractEndDate: r.contract_end_date,
    daysRemaining: daysBetween(today, r.contract_end_date),
    recommendation: r.recommendation,
    status: r.status,
    globalScore: r.global_score == null ? null : Number(r.global_score),
    rationale: r.rationale,
    trends: (r.trends ?? fallbackTrends) as RenewalCardProps["trends"],
    siteLoadForecast: r.site_load_forecast ?? {},
  };
}

export default async function CddRenewalsPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cdd_renewal_recommendations")
    .select(
      `id, employee_id, contract_end_date, prepared_at, recommendation, rationale,
       global_score, trends, site_load_forecast, status, decided_by, decided_at, decision_note,
       employees(full_name, job_title)`,
    )
    .order("contract_end_date", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown) as RawRow[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pending = rows.filter((r) => r.status === "pending" || r.status === "discussing");
  const history = rows.filter(
    (r) => r.status === "sent" || r.status === "rejected_by_admin" || r.status === "archived",
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Renouvellements CDD</h1>
        <p className="text-sm text-ink-2">
          Le système prépare les fiches J-30. Décision finale humaine, en 1 clic. Le scan tourne tous les
          jours — tu peux aussi recalculer une fiche manuellement.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">À décider ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">Historique ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            {pending.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-3">
                Rien à décider. Le scan repassera demain matin.
              </div>
            ) : (
              pending.map((r) => <RenewalCard key={r.id} {...toCardProps(r, today)} />)
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            {history.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-3">
                Aucune décision archivée pour l'instant.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((r) => (
                  <li key={r.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{r.employees?.full_name ?? "—"}</div>
                      <div className="text-xs text-ink-3">
                        Fin contrat {formatDate(r.contract_end_date)}
                        {r.decided_at ? <> · décidé le {formatDate(r.decided_at)}</> : null}
                      </div>
                      {r.decision_note ? (
                        <p className="mt-1 text-xs text-ink-2 italic">"{r.decision_note}"</p>
                      ) : null}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                        r.status === "sent"
                          ? "bg-success-light text-success"
                          : r.status === "rejected_by_admin"
                          ? "bg-danger-light text-danger"
                          : "bg-surface-2 text-ink-3"
                      }`}
                    >
                      {r.status === "sent"
                        ? "Proposition envoyée"
                        : r.status === "rejected_by_admin"
                        ? "Non-renouvellement"
                        : "Archivé"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
