// Karim 2026-05-31 : page candidat /me/screening
// Affiche les questions par categorie et permet de repondre.

import { requireAuthenticated } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScreeningForm } from "./screening-form";
import { CATEGORY_LABELS } from "@/lib/screening-scoring";

export const dynamic = "force-dynamic";

export default async function MyScreeningPage() {
  await requireAuthenticated();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: cand } = await admin.from("candidates").select("id, full_name").eq("profile_id", user.id).maybeSingle();
  if (!cand) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h1 className="text-xl font-bold mb-2">Questionnaire de profilage</h1>
        <p className="text-sm text-rose-700">Ton profil candidat n est pas encore lié. Contacte le service RH.</p>
      </div>
    );
  }

  const { data: q } = await admin
    .from("screening_questionnaires")
    .select("id, name, description, min_score_to_hire")
    .eq("is_default", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!q) return <div className="p-8 text-red-700">Aucun questionnaire actif.</div>;

  const { data: questions } = await admin
    .from("screening_questions")
    .select("id, category, question_text, question_subtitle, type, options, weight, sort_order, is_required, is_red_flag_question")
    .eq("questionnaire_id", q.id)
    .order("sort_order", { ascending: true });

  const { data: response } = await admin
    .from("screening_responses")
    .select("id, completed_at, total_score, recommendation, has_red_flag")
    .eq("candidate_id", cand.id)
    .eq("questionnaire_id", q.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existingAnswers } = response
    ? await admin.from("screening_answers").select("question_id, value_text, value_num, value_array").eq("response_id", response.id)
    : { data: [] };

  // Group questions by category
  const categories = new Map<string, typeof questions>();
  for (const qu of questions ?? []) {
    if (!categories.has(qu.category)) categories.set(qu.category, []);
    categories.get(qu.category)!.push(qu);
  }
  const sortedCats = Array.from(categories.keys());

  if (response?.completed_at) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Questionnaire complété ✓</h1>
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <div className="text-3xl font-bold text-green-800">
            {Number(response.total_score).toFixed(1)} / 100
          </div>
          <div className="text-sm text-green-700 mt-1">
            Recommandation système : <strong>{response.recommendation}</strong>
          </div>
          {response.has_red_flag && (
            <div className="text-xs text-rose-700 mt-2">
              ⚠️ Un ou plusieurs points d alerte ont été détectés. Le RH va examiner ton dossier.
            </div>
          )}
        </div>
        <p className="text-sm text-ink-2">
          Merci d avoir complété le questionnaire. L équipe RH va l examiner et te
          recontacter sous 48h.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{q.name}</h1>
        <p className="text-sm text-ink-2 mt-1">{q.description}</p>
        <p className="text-xs text-ink-3 mt-2">
          Réponds honnêtement. Tes réponses sont sauvegardées automatiquement.
          Score minimum pour être recommandé : {q.min_score_to_hire}%.
        </p>
      </div>

      <ScreeningForm
        candidateId={cand.id}
        questionnaireId={q.id}
        questionsByCategory={sortedCats.map((c) => ({
          category: c,
          label: CATEGORY_LABELS[c] ?? c,
          questions: categories.get(c) ?? [],
        }))}
        existingResponseId={response?.id ?? null}
        existingAnswers={(existingAnswers ?? []) as Array<{ question_id: string; value_text: string | null; value_num: number | null; value_array: unknown }>}
      />
    </div>
  );
}
