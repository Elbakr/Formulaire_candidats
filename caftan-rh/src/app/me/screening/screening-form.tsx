"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getOrCreateMyScreeningResponseAction,
  answerScreeningQuestionAction,
  submitScreeningResponseAction,
} from "./actions";

interface Question {
  id: string;
  category: string;
  question_text: string;
  question_subtitle: string | null;
  type: string;
  options: Array<Record<string, unknown>>;
  weight: number;
  is_required: boolean;
}

interface CategoryGroup {
  category: string;
  label: string;
  questions: Question[];
}

interface ExistingAnswer {
  question_id: string;
  value_text: string | null;
  value_num: number | null;
  value_array: unknown;
}

export function ScreeningForm({
  questionsByCategory,
  existingResponseId,
  existingAnswers,
}: {
  candidateId: string;
  questionnaireId: string;
  questionsByCategory: CategoryGroup[];
  existingResponseId: string | null;
  existingAnswers: ExistingAnswer[];
}) {
  const router = useRouter();
  const [responseId, setResponseId] = useState<string | null>(existingResponseId);
  const [answers, setAnswers] = useState<Record<string, ExistingAnswer>>(() => {
    const m: Record<string, ExistingAnswer> = {};
    for (const a of existingAnswers) m[a.question_id] = a;
    return m;
  });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [submitting, startSubmit] = useTransition();
  const [catIdx, setCatIdx] = useState(0);

  const allQuestions = useMemo(() => questionsByCategory.flatMap((c) => c.questions), [questionsByCategory]);
  const totalQ = allQuestions.length;
  const answeredQ = Object.keys(answers).length;
  const pct = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;
  const requiredMissing = allQuestions.filter((q) => q.is_required && !answers[q.id]).length;

  async function ensureResponseId(): Promise<string | null> {
    if (responseId) return responseId;
    const res = await getOrCreateMyScreeningResponseAction();
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setResponseId(res.responseId);
    return res.responseId;
  }

  async function handleAnswer(q: Question, value: { value_text?: string | null; value_num?: number | null; value_array?: unknown[] | null }) {
    const rid = await ensureResponseId();
    if (!rid) return;
    // Optimistic update
    setAnswers((p) => ({ ...p, [q.id]: { question_id: q.id, value_text: value.value_text ?? null, value_num: value.value_num ?? null, value_array: value.value_array ?? null } }));
    setSavingIds((p) => new Set(p).add(q.id));
    const res = await answerScreeningQuestionAction(rid, q.id, value);
    setSavingIds((p) => { const s = new Set(p); s.delete(q.id); return s; });
    if (!res.ok) toast.error(res.error ?? "Erreur sauvegarde");
  }

  function handleSubmit() {
    if (!responseId) return;
    if (requiredMissing > 0) {
      toast.error(`${requiredMissing} question(s) obligatoire(s) manquante(s)`);
      return;
    }
    startSubmit(async () => {
      const res = await submitScreeningResponseAction(responseId);
      if (!res.ok) toast.error(res.error ?? "Erreur");
      else {
        toast.success(`Soumis ! Score ${res.totalScore}, recommandation ${res.recommendation}`);
        router.refresh();
      }
    });
  }

  const currentCat = questionsByCategory[catIdx];
  const isLastCat = catIdx === questionsByCategory.length - 1;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <Card className="p-3">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold">{answeredQ} / {totalQ} questions répondues</span>
          <span className="text-ink-3">{pct}%</span>
        </div>
        <div className="h-2 bg-line rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {questionsByCategory.map((cg, idx) => {
          const catAnswered = cg.questions.filter((q) => answers[q.id]).length;
          const allDone = catAnswered === cg.questions.length;
          return (
            <button
              key={cg.category}
              type="button"
              onClick={() => setCatIdx(idx)}
              className={`px-2 py-1 text-[10px] font-semibold rounded border ${
                idx === catIdx
                  ? "bg-foreground text-background border-foreground"
                  : allDone
                  ? "bg-green-100 text-green-800 border-green-300"
                  : "bg-surface border-line"
              }`}
            >
              {cg.label} {allDone && "✓"} ({catAnswered}/{cg.questions.length})
            </button>
          );
        })}
      </div>

      {/* Questions de la catégorie courante */}
      <Card className="p-4 space-y-4">
        <h2 className="font-bold">{currentCat?.label}</h2>
        {currentCat?.questions.map((q, i) => (
          <QuestionItem
            key={q.id}
            q={q}
            num={i + 1}
            answer={answers[q.id] ?? null}
            saving={savingIds.has(q.id)}
            onAnswer={(v) => handleAnswer(q, v)}
          />
        ))}
        <div className="flex justify-between pt-3 border-t">
          <Button variant="outline" size="sm" disabled={catIdx === 0} onClick={() => setCatIdx(catIdx - 1)}>← Précédent</Button>
          {!isLastCat ? (
            <Button size="sm" onClick={() => setCatIdx(catIdx + 1)}>Suivant →</Button>
          ) : (
            <Button
              size="sm"
              disabled={submitting || requiredMissing > 0}
              onClick={handleSubmit}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Soumettre mes réponses
            </Button>
          )}
        </div>
        {requiredMissing > 0 && isLastCat && (
          <p className="text-xs text-rose-700">⚠️ {requiredMissing} question(s) obligatoire(s) à compléter avant de soumettre</p>
        )}
      </Card>
    </div>
  );
}

function QuestionItem({
  q,
  num,
  answer,
  saving,
  onAnswer,
}: {
  q: Question;
  num: number;
  answer: ExistingAnswer | null;
  saving: boolean;
  onAnswer: (v: { value_text?: string | null; value_num?: number | null; value_array?: unknown[] | null }) => void;
}) {
  return (
    <div className="border-b border-line pb-3 last:border-b-0">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs text-ink-3 font-mono">{num}.</span>
        <div className="flex-1">
          <div className="text-sm font-semibold flex items-center gap-1">
            {q.question_text}
            {q.is_required && <span className="text-rose-600">*</span>}
            {saving && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
            {answer && !saving && <CheckCircle2 className="w-3 h-3 text-green-600 ml-1" />}
          </div>
          {q.question_subtitle && <div className="text-xs text-ink-3 mt-0.5 italic">{q.question_subtitle}</div>}
        </div>
      </div>
      <div className="pl-5 mt-2">
        {(q.type === "single_choice" || q.type === "yes_no") && (
          <div className="space-y-1">
            {q.options.map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={q.id}
                  value={String(opt.value)}
                  checked={answer?.value_text === String(opt.value)}
                  onChange={() => onAnswer({ value_text: String(opt.value) })}
                />
                <span>{String(opt.label)}</span>
              </label>
            ))}
          </div>
        )}
        {q.type === "scale" && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-ink-3">{(q.options[0] as { labels?: string[] })?.labels?.[0] ?? "1"}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onAnswer({ value_num: v })}
                  className={`w-9 h-9 rounded border text-sm font-bold ${
                    answer?.value_num === v ? "bg-foreground text-background border-foreground" : "bg-surface border-line hover:bg-muted"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-ink-3">{(q.options[0] as { labels?: string[] })?.labels?.[1] ?? "5"}</span>
          </div>
        )}
        {q.type === "numeric" && (
          <input
            type="number"
            step="0.01"
            defaultValue={answer?.value_num ?? ""}
            onBlur={(e) => onAnswer({ value_num: e.target.value === "" ? null : parseFloat(e.target.value) })}
            className="w-32 px-2 py-1.5 border rounded text-sm"
            placeholder="0.00"
          />
        )}
        {q.type === "text_short" && (
          <textarea
            rows={3}
            defaultValue={answer?.value_text ?? ""}
            onBlur={(e) => onAnswer({ value_text: e.target.value })}
            className="w-full px-2 py-1.5 border rounded text-sm"
            placeholder="Ta réponse..."
          />
        )}
        {q.type === "multi_choice" && (
          <div className="space-y-1">
            {q.options.map((opt) => {
              const arr = (answer?.value_array as string[] | null) ?? [];
              const checked = arr.includes(String(opt.value));
              return (
                <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...arr, String(opt.value)]
                        : arr.filter((v) => v !== String(opt.value));
                      onAnswer({ value_array: next });
                    }}
                  />
                  <span>{String(opt.label)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
