import Link from "next/link";
import { Sparkles, AlertCircle, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApproveButton } from "./approve-button";
import type { SitePlanPreview } from "@/app/planning/sites/[code]/actions";

export const dynamic = "force-dynamic";

export default async function AutoDraftsPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("auto_plan_drafts")
    .select(
      `id, site_id, week_monday, generated_at, generated_by, status,
       drafts_json, uncovered_json, contract_usage_json,
       site:sites(code, name, color)`,
    )
    .eq("status", "pending")
    .order("week_monday", { ascending: true });

  type Row = {
    id: string;
    site_id: string;
    week_monday: string;
    generated_at: string;
    generated_by: string;
    status: string;
    drafts_json: SitePlanPreview["drafts"];
    uncovered_json: SitePlanPreview["uncovered"] | null;
    contract_usage_json: SitePlanPreview["contract_usage"] | null;
    site: { code: string; name: string; color: string | null } | null;
  };
  const drafts = (rows ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-gold-dark" /> Drafts auto
        </h1>
        <p className="text-sm text-ink-2 ml-1">
          Plannings pré-générés chaque dimanche pour la semaine suivante. Valide en 1 clic.
        </p>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-ink-3">
            Aucun draft en attente. Le cron s'exécute chaque dimanche à 06h00.
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {drafts.map((d) => {
            const totalShifts = d.drafts_json?.length ?? 0;
            const uncovered = d.uncovered_json ?? [];
            const totalUncovered = uncovered.reduce((acc, u) => acc + u.missing, 0);
            return (
              <Card
                key={d.id}
                style={{
                  borderTopColor: d.site?.color ?? undefined,
                  borderTopWidth: 4,
                }}
              >
                <div className="p-4 flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-lg">
                      Site {d.site?.code} — {d.site?.name}
                    </div>
                    <div className="text-xs text-ink-3 mt-1">
                      Semaine du {d.week_monday} · généré le{" "}
                      {new Date(d.generated_at).toLocaleString("fr-BE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {d.generated_by === "cron" ? " (auto)" : " (manuel)"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 rounded bg-success-light text-success text-[10px] font-bold uppercase">
                      {totalShifts} shifts
                    </span>
                    {totalUncovered > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-warn-light text-warn text-[10px] font-bold uppercase flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {totalUncovered} non couverts
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-success-light text-success text-[10px] font-bold uppercase">
                        Tous couverts
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  <ApproveButton draftId={d.id} totalShifts={totalShifts} />
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/planning/sites/${d.site?.code}?week=${d.week_monday}`}
                    >
                      Modifier d'abord <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
