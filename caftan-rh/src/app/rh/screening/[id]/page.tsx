// Karim 2026-05-31 : détail d'une réponse screening - score, breakdown, red flags.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/screening-scoring";
import { ValidateScreeningButton } from "./validate-button";

export const dynamic = "force-dynamic";

export default async function RhScreeningDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "rh"]);
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: response } = await admin
    .from("screening_responses")
    .select(`
      id, candidate_id, started_at, completed_at, total_score, category_scores,
      has_red_flag, recommendation, rh_notes, rh_decision_at,
      candidate:candidates(id, full_name, email, phone)
    `)
    .eq("id", id)
    .single();
  if (!response) return <div className="p-8 text-red-700">Réponse introuvable</div>;

  const { data: questions } = await admin
    .from("screening_questions")
    .select("id, category, question_text, type, options, is_red_flag_question")
    .eq("questionnaire_id", (await admin.from("screening_responses").select("questionnaire_id").eq("id", id).single()).data?.questionnaire_id ?? "");

  const { data: answers } = await admin
    .from("screening_answers")
    .select("question_id, value_text, value_num, value_array, score_obtained, is_red_flag_triggered")
    .eq("response_id", id);

  type Q = { id: string; category: string; question_text: string; type: string; options: Array<{ value?: unknown; label?: string }> };
  type A = { question_id: string; value_text: string | null; value_num: number | null; value_array: unknown; score_obtained: number; is_red_flag_triggered: boolean };
  const qList = (questions ?? []) as Q[];
  const aMap = new Map<string, A>((answers ?? []).map((a) => [a.question_id, a as A]));

  const r = response as unknown as {
    id: string; candidate_id: string; started_at: string; completed_at: string | null;
    total_score: number | null; category_scores: Record<string, number>;
    has_red_flag: boolean; recommendation: string | null;
    rh_notes: string | null; rh_decision_at: string | null;
    candidate: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  };

  function renderAnswerValue(q: Q, a: A | undefined): string {
    if (!a) return "—";
    if (q.type === "single_choice" || q.type === "yes_no") {
      const opt = q.options.find((o) => String(o.value) === a.value_text);
      return opt?.label ?? a.value_text ?? "—";
    }
    if (q.type === "scale" || q.type === "numeric") return String(a.value_num ?? "—");
    if (q.type === "text_short") return a.value_text ?? "—";
    if (q.type === "multi_choice") {
      const arr = (a.value_array as string[] | null) ?? [];
      return arr.map((v) => q.options.find((o) => String(o.value) === v)?.label ?? v).join(", ");
    }
    return "—";
  }

  const recCol =
    r.recommendation === "HIRE" ? "bg-green-100 text-green-800" :
    r.recommendation === "MAYBE" ? "bg-amber-100 text-amber-800" :
    "bg-red-100 text-red-800";

  // Group questions by category
  const byCat = new Map<string, Q[]>();
  for (const q of qList) {
    if (!byCat.has(q.category)) byCat.set(q.category, []);
    byCat.get(q.category)!.push(q);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Link href="/rh/screening" className="text-sm text-blue-700 hover:underline flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Retour liste
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{r.candidate?.full_name}</h1>
        <p className="text-sm text-muted-foreground">{r.candidate?.email} {r.candidate?.phone ? ` · ${r.candidate.phone}` : ""}</p>
      </div>

      {/* Score global */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Score global</div>
            <div className="text-5xl font-bold">{r.total_score !== null ? Number(r.total_score).toFixed(1) : "—"}<span className="text-lg text-ink-3">/100</span></div>
          </div>
          <div className="text-right space-y-2">
            <Badge className={`text-base px-3 py-1 ${recCol}`}>{r.recommendation ?? "EN COURS"}</Badge>
            {r.has_red_flag && (
              <div className="flex items-center gap-1 text-red-700 text-xs font-semibold">
                <AlertOctagon className="w-4 h-4" /> Red flag(s) détecté(s)
              </div>
            )}
            {r.rh_decision_at && <div className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Validé RH</div>}
          </div>
        </div>

        {/* Breakdown par catégorie */}
        {r.category_scores && Object.keys(r.category_scores).length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {Object.entries(r.category_scores).map(([cat, sc]) => (
              <div key={cat} className="border rounded p-2">
                <div className="text-[10px] text-ink-3">{CATEGORY_LABELS[cat] ?? cat}</div>
                <div className="font-bold">{Number(sc).toFixed(0)}<span className="text-ink-3 text-[10px]">/100</span></div>
                <div className="h-1 bg-line rounded-full overflow-hidden mt-1">
                  <div className={`h-full ${Number(sc) >= 65 ? "bg-green-500" : Number(sc) >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, Number(sc))}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <ValidateScreeningButton responseId={r.id} alreadyValidated={!!r.rh_decision_at} />
        </div>
      </Card>

      {/* Réponses détaillées */}
      <div className="space-y-3">
        {Array.from(byCat.entries()).map(([cat, qs]) => (
          <Card key={cat} className="p-0 overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b text-sm font-semibold">
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            <div className="divide-y">
              {qs.map((q) => {
                const a = aMap.get(q.id);
                return (
                  <div key={q.id} className="p-3 text-sm flex items-start gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-xs">{q.question_text}</div>
                      <div className="mt-1 text-sm">{renderAnswerValue(q, a)}</div>
                    </div>
                    <div className="text-right text-xs flex-shrink-0">
                      <div className="font-bold">{a ? Number(a.score_obtained).toFixed(1) : "—"}</div>
                      {a?.is_red_flag_triggered && <span className="text-red-600 text-[10px]">🚩 RED</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
