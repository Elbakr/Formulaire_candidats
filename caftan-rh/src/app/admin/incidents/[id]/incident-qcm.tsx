"use client";

// QCM "intelligent" d'un incident (incrément 2c) : plusieurs questions
// d'apprentissage, chaque réponse mémorisée + révocable, + interrupteur Pause auto.

import { useState, useTransition } from "react";
import { CheckCircle2, ShieldAlert, RotateCcw, Brain } from "lucide-react";
import { answerQcmAction, revokeRuleAction, togglePauseAction } from "./qcm-actions";

type Option = { key: string; label: string; hint: string; mode: string };
type Question = { id: string; question: string; options: Option[] };

export function IncidentQcm(props: {
  incidentId: string;
  signature: string;
  questions: Question[];
  activeAnswers: Record<string, string>; // questionId -> optionKey
  activeLabels: Record<string, string>;  // questionId -> libellé
  autoPaused: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await fn();
      if (r.ok) setMsg(r.message ?? "Fait.");
      else setErr(r.error ?? "Échec.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Brain className="h-4 w-4 text-gold-dark" /> Apprends-moi quoi faire
      </div>

      {props.questions.map((q) => {
        const active = props.activeAnswers[q.id] ?? null;
        return (
          <div key={q.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="text-sm font-semibold mb-2">{q.question}</div>
            <div className="space-y-2">
              {q.options.map((o) => {
                const isActive = active === o.key;
                return (
                  <button
                    key={o.key}
                    disabled={pending}
                    onClick={() => run(() => answerQcmAction(props.incidentId, q.id, o.key))}
                    className={`w-full text-left rounded-md border p-2.5 transition-colors disabled:opacity-50 ${
                      isActive ? "border-gold bg-gold/10" : "border-line hover:border-gold hover:bg-gold/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isActive ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : null}
                      <span className="text-sm font-semibold">{o.label}</span>
                      {o.mode === "auto" ? (
                        <span className="text-[9px] uppercase tracking-wider font-bold text-gold-dark bg-gold/15 px-1.5 py-0.5 rounded">
                          auto
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-ink-3 mt-0.5">{o.hint}</div>
                  </button>
                );
              })}
            </div>
            {active ? (
              <button
                disabled={pending}
                onClick={() => run(() => revokeRuleAction(props.signature, q.id, props.incidentId))}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-3 hover:text-danger disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> Révoquer ma réponse (« {props.activeLabels[q.id] ?? active} »)
              </button>
            ) : null}
          </div>
        );
      })}

      {/* Interrupteur global Pause auto */}
      <div className="flex items-center justify-between rounded-lg border border-line p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
          <div className="text-xs text-ink-2">
            <b>Pause auto</b> — gèle toute action automatique de l'agent (il revient à juste te notifier).
            {props.autoPaused ? <span className="text-danger font-semibold"> Actuellement EN PAUSE.</span> : null}
          </div>
        </div>
        <button
          disabled={pending}
          onClick={() => run(() => togglePauseAction(!props.autoPaused, props.incidentId))}
          className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md border disabled:opacity-50 ${
            props.autoPaused
              ? "border-success text-success hover:bg-success-light/30"
              : "border-danger text-danger hover:bg-danger-light/30"
          }`}
        >
          {props.autoPaused ? "Réactiver l'auto" : "Mettre en pause"}
        </button>
      </div>

      {msg ? <div className="text-sm text-success font-medium">{msg}</div> : null}
      {err ? <div className="text-sm text-danger font-medium">{err}</div> : null}
    </div>
  );
}
