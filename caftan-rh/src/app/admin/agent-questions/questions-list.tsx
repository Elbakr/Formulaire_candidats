"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { answerTrainingQuestion, revokeTrainingQuestion } from "./actions";

type Option = { key: string; label: string; hint?: string; mode: "auto" | "suggest" };
type Question = { id: string; category: string; question: string; why: string; options: Option[] };

export function QuestionsList(props: {
  questions: Question[];
  answers: Record<string, string>; // qid -> optionKey
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({}); // qid -> message

  function setFlashFor(qid: string, msg: string) {
    setFlash((f) => ({ ...f, [qid]: msg }));
  }

  function answer(qid: string, key: string) {
    setBusy(qid);
    start(async () => {
      const r = await answerTrainingQuestion(qid, key);
      setBusy(null);
      setFlashFor(qid, r.ok ? "✓ Enregistré" : `✗ ${r.error ?? "Échec"}`);
    });
  }
  function revoke(qid: string) {
    setBusy(qid);
    start(async () => {
      await revokeTrainingQuestion(qid);
      setBusy(null);
      setFlashFor(qid, "✓ Réponse effacée");
    });
  }

  // groupe par catégorie en conservant l'ordre
  const cats: string[] = [];
  for (const q of props.questions) if (!cats.includes(q.category)) cats.push(q.category);

  return (
    <div className="space-y-5">
      {cats.map((cat) => (
        <div key={cat} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{cat}</h2>
          {props.questions.filter((q) => q.category === cat).map((q) => {
            const chosen = props.answers[q.id] ?? null;
            const answered = !!chosen;
            return (
              <div
                key={q.id}
                className={`rounded-lg border p-3 ${answered ? "border-line bg-surface" : "border-warn/50 bg-warn-light/20"}`}
              >
                <div className="flex items-start gap-2">
                  {answered
                    ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    : <span className="mt-1 h-2 w-2 rounded-full bg-warn shrink-0" />}
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{q.question}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">{q.why}</div>
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o) => {
                    const isActive = chosen === o.key;
                    return (
                      <button
                        key={o.key}
                        disabled={pending && busy === q.id}
                        onClick={() => answer(q.id, o.key)}
                        className={`text-left rounded-md border p-2 text-sm transition-colors disabled:opacity-50 ${
                          isActive ? "border-gold bg-gold/10 font-semibold" : "border-line hover:border-gold hover:bg-gold/5"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {o.label}
                          {o.mode === "auto" ? (
                            <span className="text-[8px] uppercase font-bold text-gold-dark bg-gold/15 px-1 py-0.5 rounded">auto</span>
                          ) : null}
                        </span>
                        {o.hint ? <span className="block text-[10px] text-ink-3 mt-0.5">{o.hint}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {answered ? (
                    <button
                      disabled={pending && busy === q.id}
                      onClick={() => revoke(q.id)}
                      className="inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-danger disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Effacer ma réponse
                    </button>
                  ) : <span />}
                  {flash[q.id] ? (
                    <span className={`text-[11px] font-semibold ${flash[q.id].startsWith("✓") ? "text-success" : "text-danger"}`}>
                      {flash[q.id]}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
