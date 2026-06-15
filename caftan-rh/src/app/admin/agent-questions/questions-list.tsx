"use client";

// Incrément custom-value : champ de saisie libre pour les questions quantifiables.

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { answerTrainingQuestion, revokeTrainingQuestion } from "./actions";

type Option = { key: string; label: string; hint?: string; mode: "auto" | "suggest" };
type CustomInput = {
  type: "percent" | "number" | "text";
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
};
type Question = {
  id: string;
  category: string;
  question: string;
  why: string;
  options: Option[];
  custom?: CustomInput;
};

export function QuestionsList(props: {
  questions: Question[];
  answers: Record<string, string>;      // qid -> optionKey
  customValues: Record<string, string>; // qid -> custom_value (si chosen=custom)
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({}); // qid -> message
  // Valeurs custom locales : qid -> valeur saisie
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  function setFlashFor(qid: string, msg: string) {
    setFlash((f) => ({ ...f, [qid]: msg }));
  }

  function setCustomInput(qid: string, val: string) {
    setCustomInputs((prev) => ({ ...prev, [qid]: val }));
  }

  function answer(qid: string, key: string, customValue?: string) {
    setBusy(qid);
    start(async () => {
      const r = await answerTrainingQuestion(qid, key, customValue);
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
            const isCustomChosen = chosen === "custom";
            const activeCustom = props.customValues[q.id] ?? null;
            const inputVal = customInputs[q.id] ?? "";

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

                  {/* Champ de saisie libre (custom) */}
                  {q.custom ? (
                    <div className={`col-span-full rounded-md border p-2 transition-colors ${isCustomChosen ? "border-gold bg-gold/10" : "border-line"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCustomChosen ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> : null}
                        <span className="text-sm font-semibold">{q.custom.label} :</span>
                        <input
                          type={q.custom.type === "text" ? "text" : "number"}
                          inputMode={q.custom.type === "text" ? "text" : "numeric"}
                          min={q.custom.min}
                          max={q.custom.max}
                          step={1}
                          value={inputVal}
                          placeholder={q.custom.placeholder ?? ""}
                          disabled={pending && busy === q.id}
                          onChange={(e) => setCustomInput(q.id, e.target.value)}
                          className="w-20 rounded border border-line bg-white px-2 py-1 text-sm focus:border-gold focus:outline-none disabled:opacity-50"
                        />
                        {q.custom.unit ? <span className="text-xs text-ink-3">{q.custom.unit}</span> : null}
                        <button
                          disabled={(pending && busy === q.id) || !inputVal.trim()}
                          onClick={() => answer(q.id, "custom", inputVal.trim())}
                          className="ml-1 rounded-md border border-gold px-2 py-1 text-xs font-bold text-gold-dark hover:bg-gold/10 disabled:opacity-40 transition-colors"
                        >
                          Valider
                        </button>
                      </div>
                      {isCustomChosen && activeCustom ? (
                        <div className="text-[10px] text-ink-3 mt-1">
                          Valeur active : <b>{activeCustom}{q.custom.unit ? ` ${q.custom.unit}` : ""}</b>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {answered ? (
                    <button
                      disabled={pending && busy === q.id}
                      onClick={() => revoke(q.id)}
                      className="inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-danger disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Effacer ma réponse
                      {isCustomChosen && activeCustom
                        ? ` (${activeCustom}${q.custom?.unit ? ` ${q.custom.unit}` : ""})`
                        : null}
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
