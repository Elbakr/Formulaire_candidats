// Karim 2026-05-31 : tableau de bord screening cote RH - liste des reponses.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertOctagon, Clock, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RhScreeningPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: responses } = await admin
    .from("screening_responses")
    .select(`
      id, candidate_id, started_at, completed_at, total_score, recommendation,
      has_red_flag, rh_decision_at,
      candidate:candidates(id, full_name, email)
    `)
    .order("started_at", { ascending: false });

  type Row = {
    id: string; candidate_id: string; started_at: string; completed_at: string | null;
    total_score: number | null; recommendation: string | null; has_red_flag: boolean;
    rh_decision_at: string | null;
    candidate: { id: string; full_name: string; email: string | null } | null;
  };
  const rows = (responses ?? []) as Row[];

  const hire = rows.filter((r) => r.recommendation === "HIRE").length;
  const maybe = rows.filter((r) => r.recommendation === "MAYBE").length;
  const pass = rows.filter((r) => r.recommendation === "PASS").length;
  const inProgress = rows.filter((r) => !r.completed_at).length;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profilage candidats</h1>
        <p className="text-sm text-muted-foreground">Résultats du questionnaire de screening.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs">✅ HIRE</div><div className="text-2xl font-bold text-green-700">{hire}</div></Card>
        <Card className="p-4"><div className="text-xs">🟠 MAYBE</div><div className="text-2xl font-bold text-amber-700">{maybe}</div></Card>
        <Card className="p-4"><div className="text-xs">❌ PASS</div><div className="text-2xl font-bold text-red-700">{pass}</div></Card>
        <Card className="p-4"><div className="text-xs">⏳ En cours</div><div className="text-2xl font-bold">{inProgress}</div></Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="divide-y">
          {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Aucune réponse pour le moment.</div>}
          {rows.map((r) => {
            const recCol = r.recommendation === "HIRE" ? "text-green-700" : r.recommendation === "MAYBE" ? "text-amber-700" : "text-red-700";
            return (
              <div key={r.id} className="p-4 flex items-center gap-3 hover:bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{r.candidate?.full_name ?? "—"}</div>
                  <div className="text-xs text-ink-3">{r.candidate?.email ?? ""}</div>
                </div>
                <div className="text-right">
                  {r.completed_at ? (
                    <div className={`text-lg font-bold ${recCol}`}>
                      {Number(r.total_score).toFixed(0)}<span className="text-xs text-ink-3">/100</span>
                    </div>
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600" />
                  )}
                  <div className="text-xs">{r.completed_at ? r.recommendation : "en cours"}</div>
                </div>
                {r.has_red_flag && <AlertOctagon className="w-5 h-5 text-red-600" title="Red flag" />}
                {r.rh_decision_at && <CheckCircle2 className="w-5 h-5 text-green-600" title="Validé RH" />}
                <Link href={`/rh/screening/${r.id}`} className="text-blue-700 hover:underline text-sm flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Détails
                </Link>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
