"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { saveResponseAction, submitPreInterviewAction } from "./actions";
import { VideoQuestion } from "./video-question";
import {
  type PreInterviewQuestion,
  type PreInterviewResponse,
  preInterviewProgress,
} from "@/lib/pre-interview-types";
import { t, dateLocaleStr, type Locale } from "@/lib/i18n";

type LocalAnswer = {
  text: string;
  choices: string[];
  scale: number | null;
  videoPath: string | null;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 800;

export function PreInterviewForm({
  token,
  questions,
  initialResponses,
  expiresAt,
  locale = "fr",
}: {
  token: string;
  questions: PreInterviewQuestion[];
  initialResponses: PreInterviewResponse[];
  expiresAt: string | null;
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initial: Record<string, LocalAnswer> = useMemo(() => {
    const out: Record<string, LocalAnswer> = {};
    for (const q of questions) {
      const r = initialResponses.find((x) => x.question_id === q.id);
      out[q.id] = {
        text: r?.answer_text ?? "",
        choices: Array.isArray(r?.answer_choices) ? (r!.answer_choices as string[]) : [],
        scale: typeof r?.answer_scale === "number" ? r!.answer_scale : null,
        videoPath: r?.video_storage_path ?? null,
        saving: false,
        saved: !!r,
        error: null,
      };
    }
    return out;
  }, [questions, initialResponses]);

  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(initial);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  // Compute progress for the sticky bar from current local state
  const responsesForProgress = useMemo(
    () =>
      Object.entries(answers).map(([qid, a]) => ({
        id: qid,
        pre_interview_id: "",
        question_id: qid,
        answer_text: a.text || null,
        answer_choices: a.choices.length > 0 ? a.choices : null,
        answer_scale: a.scale,
        video_storage_path: a.videoPath,
        video_duration_sec: null,
        video_purge_after: null,
        answered_at: new Date().toISOString(),
      })),
    [answers],
  );
  const progress = preInterviewProgress(questions, responsesForProgress);
  const allRequiredAnswered = progress.answered === progress.total && progress.total > 0;

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => {
        if (t) clearTimeout(t);
      });
    };
  }, []);

  function scheduleSave(questionId: string) {
    const existing = timersRef.current[questionId];
    if (existing) clearTimeout(existing);
    timersRef.current[questionId] = setTimeout(
      () => doSave(questionId),
      DEBOUNCE_MS,
    );
  }

  async function doSave(questionId: string) {
    const current = answers[questionId];
    if (!current) return;
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], saving: true, error: null },
    }));
    const res = await saveResponseAction({
      token,
      questionId,
      answerText: current.text || null,
      answerChoices: current.choices.length > 0 ? current.choices : null,
      answerScale: current.scale,
    });
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        saving: false,
        saved: res.ok,
        error: res.ok ? null : res.error,
      },
    }));
    if (!res.ok) toast.error(res.error);
  }

  function updateText(qid: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], text: value, saved: false },
    }));
    scheduleSave(qid);
  }

  function updateScale(qid: string, value: number) {
    setAnswers((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], scale: value, saved: false },
    }));
    // No debounce for click-driven inputs
    setTimeout(() => doSave(qid), 50);
  }

  function toggleChoice(qid: string, value: string, kind: "single_choice" | "multi_choice") {
    setAnswers((prev) => {
      const cur = prev[qid];
      let next: string[];
      if (kind === "single_choice") {
        // Karim 18/05 : NE PAS deselectionner si re-click sur la meme option
        // (avant : toggle off = choices=[] -> serveur rejetait le submit).
        // Pour un single_choice, on REMPLACE toujours par la nouvelle valeur.
        next = [value];
      } else {
        next = cur.choices.includes(value)
          ? cur.choices.filter((v) => v !== value)
          : [...cur.choices, value];
      }
      return { ...prev, [qid]: { ...cur, choices: next, saved: false } };
    });
    setTimeout(() => doSave(qid), 50);
  }

  function submit() {
    if (!allRequiredAnswered) {
      // Karim 18/05 : au lieu d un toast generique, on liste les questions
      // oubliees + scroll vers la 1ere pour que le candidat sache quoi corriger.
      const missing: number[] = [];
      let firstMissingId: string | null = null;
      questions.forEach((q, idx) => {
        if (!q.is_required) return;
        const a = answers[q.id];
        if (!a) return;
        const hasText = (a.text ?? "").trim().length > 0;
        const hasChoices = Array.isArray(a.choices) && a.choices.length > 0;
        const hasScale = typeof a.scale === "number";
        const hasVideo = !!(a.videoPath && a.videoPath.length > 0);
        if (!hasText && !hasChoices && !hasScale && !hasVideo) {
          missing.push(idx + 1);
          if (!firstMissingId) firstMissingId = q.id;
        }
      });
      const list = missing.join(", ");
      toast.error(`Manque la question ${missing.length > 1 ? "s" : ""}${list}`, { duration: 6000 });
      if (firstMissingId) {
        const el = document.getElementById(`q-${firstMissingId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    // Karim 18/05 : confirm() browser etait bloque silencieusement sur certains
    // contextes (Safari iOS PWA, tunnel cloudflared), Karim cliquait
    // "Soumettre" mais le confirm retournait false sans le montrer -> rien
    // ne se passait. On retire le confirm pour plus de fiabilite.
    console.log("[pre-interview] submit() triggered, all required answered:", allRequiredAnswered);
    startTransition(async () => {
      // Force-flush any pending debounced saves before submit
      const pendingIds = Object.keys(timersRef.current).filter((k) => timersRef.current[k]);
      for (const qid of pendingIds) {
        const tm = timersRef.current[qid];
        if (tm) clearTimeout(tm);
        await doSave(qid);
      }
      const res = await submitPreInterviewAction({ token });
      console.log("[pre-interview] submit result:", res);
      if (!res.ok) {
        toast.error(res.error ?? "Erreur lors de la soumission", { duration: 8000 });
        return;
      }
      toast.success(t("pre_interview.submit_error_toast", locale));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h1 className="text-lg sm:text-xl font-bold">{t("pre_interview.welcome.title", locale)}</h1>
        <p className="text-sm text-ink-2 mt-1 leading-relaxed">
          {t("pre_interview.welcome.intro", locale)}
        </p>
        {expiresAt ? (
          <p className="text-[11px] text-ink-3 mt-2">
            {t("pre_interview.deadline_label", locale, {
              date: new Date(expiresAt).toLocaleDateString(dateLocaleStr(locale), { dateStyle: "long" }),
            })}
          </p>
        ) : null}
      </Card>

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <Card key={q.id} id={`q-${q.id}`} className="p-4 scroll-mt-20">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gold-light text-gold-dark text-xs font-bold">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-bold leading-relaxed text-ink block">
                  {q.prompt}
                  {q.is_required ? <span className="text-danger ml-1">*</span> : null}
                </Label>

                <div className="mt-3">
                  {q.kind === "text" ? (
                    <TextField
                      qid={q.id}
                      value={answers[q.id]?.text ?? ""}
                      onChange={(v) => updateText(q.id, v)}
                      max={q.max_chars}
                      min={q.min_chars}
                    />
                  ) : null}

                  {q.kind === "scale_1_5" ? (
                    <ScaleField
                      value={answers[q.id]?.scale ?? null}
                      onPick={(v) => updateScale(q.id, v)}
                      locale={locale}
                    />
                  ) : null}

                  {q.kind === "single_choice" || q.kind === "multi_choice" ? (
                    <ChoiceField
                      kind={q.kind as "single_choice" | "multi_choice"}
                      choices={q.choices ?? []}
                      selected={answers[q.id]?.choices ?? []}
                      onToggle={(v) =>
                        toggleChoice(
                          q.id,
                          v,
                          q.kind as "single_choice" | "multi_choice",
                        )
                      }
                    />
                  ) : null}

                  {q.kind === "video" ? (
                    <VideoQuestion
                      token={token}
                      questionId={q.id}
                      maxSeconds={q.video_max_seconds ?? 90}
                      initialResponse={initialResponses.find(
                        (r) => r.question_id === q.id,
                      )}
                      onTextFallback={(v) => updateText(q.id, v)}
                    />
                  ) : null}
                </div>

                <SaveIndicator
                  saving={!!answers[q.id]?.saving}
                  saved={!!answers[q.id]?.saved}
                  error={answers[q.id]?.error ?? null}
                  locale={locale}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-3 bg-canvas/95 backdrop-blur border-t border-line">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-ink-2 font-bold">
              {t("pre_interview.progress_required", locale, { n: progress.answered, total: progress.total })}
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
          <Button
            variant="gold"
            disabled={!allRequiredAnswered || pending}
            onClick={submit}
            className="min-h-11"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {pending ? t("pre_interview.submitting", locale) : t("pre_interview.submit", locale)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({
  saving,
  saved,
  error,
  locale = "fr",
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
  locale?: Locale;
}) {
  if (error) {
    return (
      <div className="mt-2 text-[11px] text-danger flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {t("pre_interview.error_prefix", locale, { msg: error })}
      </div>
    );
  }
  if (saving) {
    return (
      <div className="mt-2 text-[11px] text-ink-3 flex items-center gap-1">
        <Save className="h-3 w-3 animate-pulse" /> {t("pre_interview.saving", locale)}
      </div>
    );
  }
  if (saved) {
    return (
      <div className="mt-2 text-[11px] text-success flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> {t("pre_interview.saved", locale)}
      </div>
    );
  }
  return null;
}

function TextField({
  qid,
  value,
  onChange,
  min,
  max,
}: {
  qid: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
}) {
  const len = value.length;
  const tooShort = min > 0 && len > 0 && len < min;
  return (
    <>
      <Textarea
        id={qid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={max || undefined}
        className="text-base sm:text-sm leading-relaxed"
        style={{ minHeight: 100 }}
      />
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-3">
        {min > 0 ? (
          <span className={tooShort ? "text-warn" : ""}>
            {len}/{min} min
          </span>
        ) : null}
        {max > 0 ? (
          <span className="ml-auto">
            {len}/{max}
          </span>
        ) : null}
      </div>
    </>
  );
}

function ScaleField({
  value,
  onPick,
  locale = "fr",
}: {
  value: number | null;
  onPick: (n: number) => void;
  locale?: Locale;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={
              "min-w-12 min-h-12 px-3 rounded-md border-[1.5px] text-base font-bold transition-colors " +
              (active
                ? "bg-gold border-gold text-[#1a1a0d]"
                : "bg-surface border-line text-ink-2 hover:border-gold")
            }
            aria-pressed={active}
          >
            {n}
          </button>
        );
      })}
      <span className="text-[11px] text-ink-3 self-center ml-1">{t("pre_interview.scale_hint", locale)}</span>
    </div>
  );
}

function ChoiceField({
  kind,
  choices,
  selected,
  onToggle,
}: {
  kind: "single_choice" | "multi_choice";
  choices: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {choices.map((c) => {
        const active = selected.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onToggle(c.value)}
            className={
              "w-full min-h-11 text-left px-3 py-2.5 rounded-md border-[1.5px] text-sm font-medium transition-colors flex items-center gap-3 " +
              (active
                ? "bg-gold-light border-gold text-gold-dark"
                : "bg-surface border-line text-ink-2 hover:border-gold")
            }
            aria-pressed={active}
          >
            <span
              className={
                "inline-block flex-shrink-0 w-4 h-4 rounded-full border-[1.5px] " +
                (kind === "single_choice"
                  ? "rounded-full"
                  : "rounded-[3px]") +
                " " +
                (active ? "bg-gold border-gold" : "border-line")
              }
            />
            <span className="flex-1">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

