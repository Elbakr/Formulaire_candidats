"use client";

// Karim 2026-07-12 : page de formation du travailleur (accès token, sans compte).
// Affiche la section du jour (ton ludique), 2 boutons (hâte d'apprendre / c'est lu),
// et EN BAS un champ commentaire/anomalie toujours disponible. Mesure le temps de
// lecture (ouverture -> confirmation) pour le profilage.

import { useRef, useState, useTransition } from "react";
import { Rocket, ThumbsUp, Loader2, Send, MessageSquarePlus, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { confirmModuleAction, submitTrainingFeedbackAction, submitExamAction, setTrainingRhythmAction } from "./actions";

export type ExamQuestionView = {
  q_fr: string;
  q_nl: string | null;
  choices_fr: string[];
  choices_nl: string[] | null;
};

export type TrainingModuleView = {
  seq: number;
  kind: string;
  category: string | null;
  title_fr: string;
  title_nl: string | null;
  body_fr: string;
  body_nl: string | null;
  exam_level: number | null;
};

export function FormerClient({
  token,
  total,
  module: mod,
  examQuestions,
  confirmed,
  initialLang,
  initialRhythm,
}: {
  token: string;
  total: number;
  module: TrainingModuleView;
  examQuestions: ExamQuestionView[];
  confirmed: boolean;
  initialLang: "fr" | "nl";
  initialRhythm: "daily" | "spread30";
}) {
  const [lang, setLang] = useState<"fr" | "nl">(initialLang);
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(confirmed);
  const startRef = useRef<number>(Date.now());

  const title = (lang === "nl" ? mod.title_nl : mod.title_fr) || mod.title_fr;
  const body = (lang === "nl" ? mod.body_nl : mod.body_fr) || mod.body_fr;
  const isExam = mod.kind === "exam";
  const pct = total > 0 ? Math.round((mod.seq / total) * 100) : 0;

  function confirm(eager: boolean) {
    const readingSeconds = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    start(async () => {
      const r = await confirmModuleAction(token, mod.seq, eager, readingSeconds);
      if (!r.ok) {
        toast.error(r.error ?? (lang === "nl" ? "Er ging iets mis." : "Une erreur est survenue."));
        return;
      }
      if (eager && !r.done) {
        window.location.reload(); // section suivante
      } else {
        setWaiting(true);
      }
    });
  }

  const t = {
    fr: {
      eager: "Hâte d'apprendre la suite 🚀",
      done: "C'est lu, j'attends la prochaine 👍",
      exam: "Commencer l'examen",
      examSoon: "Ton petit examen arrive très bientôt 🧩 — en attendant, tu peux continuer.",
      continue: "Continuer",
      waitTitle: "Bravo, section validée ! 🎉",
      waitBody: "Ta prochaine section t'attend demain à 9h. Tu peux aussi cliquer « Hâte d'apprendre » dès qu'elle arrive.",
      fbTitle: "Un commentaire, une info ou un souci à signaler ?",
      fbHint: "Écris-nous à tout moment — c'est lu par l'équipe RH.",
      send: "Envoyer",
      sent: "Merci, bien reçu 🙏",
      kinds: { comment: "Commentaire", anomaly: "Anomalie / souci", info: "Info à déclarer" },
      step: `Section ${mod.seq} / ${total}`,
    },
    nl: {
      eager: "Zin om verder te leren 🚀",
      done: "Gelezen, ik wacht op de volgende 👍",
      exam: "Toets starten",
      examSoon: "Je kleine toets komt er zeer binnenkort aan 🧩 — je kan intussen verdergaan.",
      continue: "Verdergaan",
      waitTitle: "Bravo, sectie voltooid! 🎉",
      waitBody: "Je volgende sectie staat morgen om 9u klaar. Je kan ook op « Zin om verder te leren » klikken.",
      fbTitle: "Een opmerking, info of probleem melden?",
      fbHint: "Schrijf ons op elk moment — het HR-team leest mee.",
      send: "Versturen",
      sent: "Bedankt, goed ontvangen 🙏",
      kinds: { comment: "Opmerking", anomaly: "Probleem", info: "Info melden" },
      step: `Sectie ${mod.seq} / ${total}`,
    },
  }[lang];

  return (
    <div className="min-h-[100dvh] bg-ink py-6 px-4">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Header + langue + progression */}
        <div className="flex items-center justify-between">
          <span className="text-canvas/70 text-xs font-semibold">{t.step}</span>
          <div className="flex gap-1">
            {(["fr", "nl"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`text-[11px] font-bold rounded px-2 py-0.5 ${lang === l ? "bg-gold text-ink" : "bg-white/10 text-canvas/70"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Carte contenu */}
        <div className="rounded-2xl bg-white p-5 shadow-xl">
          {mod.category ? <div className="text-[11px] font-bold uppercase tracking-wider text-gold-dark">{mod.category}</div> : null}
          <h1 className="text-xl font-bold text-ink mt-0.5">{title}</h1>
          <div className="mt-3 text-[15px] text-ink-2 leading-relaxed whitespace-pre-line">{body}</div>

          {isExam && examQuestions.length > 0 && !waiting ? (
            <ExamQuiz token={token} seq={mod.seq} questions={examQuestions} lang={lang} startRef={startRef} />
          ) : waiting ? (
            <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto" />
              <div className="font-bold text-emerald-800 mt-1">{t.waitTitle}</div>
              <p className="text-[13px] text-emerald-800/80 mt-1">{t.waitBody}</p>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => confirm(true)}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-canvas font-bold py-3 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                {isExam ? t.continue : t.eager}
              </button>
              {!isExam ? (
                <button
                  onClick={() => confirm(false)}
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line text-ink font-semibold py-3 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  <ThumbsUp className="h-5 w-5" />
                  {t.done}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Champ commentaire / anomalie — TOUJOURS disponible */}
        <FeedbackBox token={token} seq={mod.seq} t={t} />

        {/* Choix du rythme */}
        <RhythmControl token={token} initial={initialRhythm} lang={lang} />
      </div>
    </div>
  );
}

function RhythmControl({ token, initial, lang }: { token: string; initial: "daily" | "spread30"; lang: "fr" | "nl" }) {
  const [rhythm, setRhythm] = useState<"daily" | "spread30">(initial);
  const [pending, start] = useTransition();
  const tt =
    lang === "nl"
      ? { title: "Mijn tempo", daily: "1 per dag", spread: "Rustiger (± 30 dagen)", saved: "Tempo opgeslagen." }
      : { title: "Mon rythme", daily: "1 par jour", spread: "Plus étalé (± 30 jours)", saved: "Rythme enregistré." };
  function choose(r: "daily" | "spread30") {
    if (r === rhythm) return;
    setRhythm(r);
    start(async () => {
      const res = await setTrainingRhythmAction(token, r);
      if (res.ok) toast.success(tt.saved);
      else {
        setRhythm(rhythm);
        toast.error(res.error ?? "Erreur");
      }
    });
  }
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
      <div className="text-canvas/80 text-[12px] font-semibold mb-2">⚙️ {tt.title}</div>
      <div className="flex gap-2">
        {([["daily", tt.daily], ["spread30", tt.spread]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={pending}
            onClick={() => choose(key)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition-colors ${rhythm === key ? "bg-gold text-ink" : "bg-white/10 text-canvas/70"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExamQuiz({
  token,
  seq,
  questions,
  lang,
  startRef,
}: {
  token: string;
  seq: number;
  questions: ExamQuestionView[];
  lang: "fr" | "nl";
  startRef: React.MutableRefObject<number>;
}) {
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  const allAnswered = answers.every((a) => a >= 0);
  const tt =
    lang === "nl"
      ? { submit: "Mijn antwoorden versturen", res: "Jouw resultaat", bravo: "Knap gedaan! 🎉", ok: "Goed bezig! 👍", low: "Geen zorgen, je leert bij 💪", next: "Volgende sectie morgen om 9u." }
      : { submit: "Envoyer mes réponses", res: "Ton résultat", bravo: "Excellent ! 🎉", ok: "Bien joué ! 👍", low: "Pas de souci, tu progresses 💪", next: "Prochaine section demain à 9h." };

  function submit() {
    if (!allAnswered) return;
    const readingSeconds = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    start(async () => {
      const r = await submitExamAction(token, seq, answers, readingSeconds);
      if (!r.ok) {
        toast.error(r.error ?? "Erreur");
        return;
      }
      setResult({ score: r.score ?? 0, total: r.total ?? questions.length });
    });
  }

  if (result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    const msg = pct >= 80 ? tt.bravo : pct >= 50 ? tt.ok : tt.low;
    return (
      <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
        <Sparkles className="h-7 w-7 text-emerald-600 mx-auto" />
        <div className="text-sm text-emerald-800/80 mt-1">{tt.res}</div>
        <div className="text-3xl font-extrabold text-emerald-800">
          {result.score}/{result.total}
        </div>
        <div className="font-bold text-emerald-800 mt-1">{msg}</div>
        <p className="text-[13px] text-emerald-800/70 mt-2">{tt.next}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {questions.map((q, qi) => {
        const label = (lang === "nl" ? q.q_nl : q.q_fr) || q.q_fr;
        const choices = (lang === "nl" ? q.choices_nl : q.choices_fr) || q.choices_fr;
        return (
          <div key={qi} className="rounded-xl border border-line p-3">
            <div className="text-[14px] font-semibold text-ink mb-2">
              {qi + 1}. {label}
            </div>
            <div className="flex flex-col gap-1.5">
              {choices.map((ch, ci) => {
                const active = answers[qi] === ci;
                return (
                  <button
                    key={ci}
                    type="button"
                    onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? ci : v)))}
                    className={`text-left rounded-lg border px-3 py-2 text-[14px] transition-colors ${
                      active ? "border-gold bg-gold-light/60 font-semibold text-ink" : "border-line hover:bg-surface-2 text-ink-2"
                    }`}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <button
        onClick={submit}
        disabled={pending || !allAnswered}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-canvas font-bold py-3 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        {tt.submit}
      </button>
    </div>
  );
}

function FeedbackBox({
  token,
  seq,
  t,
}: {
  token: string;
  seq: number;
  t: {
    fbTitle: string;
    fbHint: string;
    send: string;
    sent: string;
    kinds: { comment: string; anomaly: string; info: string };
  };
}) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"comment" | "anomaly" | "info">("comment");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  function send() {
    if (!msg.trim()) return;
    start(async () => {
      const r = await submitTrainingFeedbackAction(token, seq, kind, msg);
      if (r.ok) {
        setSent(true);
        setMsg("");
        toast.success(t.sent);
        setTimeout(() => setSent(false), 4000);
      } else {
        toast.error(r.error ?? "Erreur");
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-2 text-canvas font-semibold text-sm">
        <MessageSquarePlus className="h-4 w-4 text-gold" />
        {t.fbTitle}
      </div>
      <p className="text-[11px] text-canvas/60 mt-0.5">{t.fbHint}</p>
      <div className="mt-2 flex gap-1.5">
        {(["comment", "anomaly", "info"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${kind === k ? "bg-gold text-ink" : "bg-white/10 text-canvas/70"}`}
          >
            {t.kinds[k]}
          </button>
        ))}
      </div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        className="mt-2 w-full rounded-lg bg-white text-ink text-sm p-2.5 outline-none"
        placeholder="…"
      />
      <button
        onClick={send}
        disabled={pending || !msg.trim()}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gold text-ink font-bold text-sm px-3 py-2 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {sent ? t.sent : t.send}
      </button>
    </div>
  );
}
