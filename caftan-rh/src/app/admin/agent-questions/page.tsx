import { Brain, Zap, HandMetal, CircleHelp } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { TRAINING_QUESTIONS, trainingModeFor } from "@/lib/incident/agent-questions";
import { getLearningsForSignature } from "@/lib/incident/learnings";
import { QuestionsList } from "./questions-list";

export const dynamic = "force-dynamic";

export default async function AgentQuestionsPage() {
  await requireRole(["admin"]);

  const learnings = await getLearningsForSignature("policy");
  const answers: Record<string, string> = {};
  const customValues: Record<string, string> = {};
  for (const l of learnings) {
    const qk = l.question_key ?? "";
    answers[qk] = l.chosen_option;
    if (l.chosen_option === "custom" && l.custom_value) {
      customValues[qk] = l.custom_value;
    }
  }

  const total = TRAINING_QUESTIONS.length;
  let auto = 0, escalate = 0;
  for (const q of TRAINING_QUESTIONS) {
    const a = answers[q.id];
    if (!a) continue;
    if (trainingModeFor(q.id, a) === "auto") auto++; else escalate++;
  }
  const answered = auto + escalate;
  const unanswered = total - answered;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Brain className="h-5 w-5 text-gold-dark" /> Apprentissage de l'agent
        </h1>
        <p className="text-sm text-ink-2">
          Réponds à ces questions pour entraîner ton futur E-HR Director. Chaque réponse « auto » lui donne
          le droit d'agir seul (révocable) ; les autres = il te sollicite. Reviens-y quand tu veux.
        </p>
      </div>

      {/* Récap : ce que l'agent sait faire seul vs ce qu'il escalade */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <div className="p-3 text-center">
            <Zap className="h-5 w-5 text-success mx-auto" />
            <div className="text-2xl font-bold tabular-nums mt-1">{auto}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Agit seul</div>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <HandMetal className="h-5 w-5 text-info mx-auto" />
            <div className="text-2xl font-bold tabular-nums mt-1">{escalate}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Te sollicite</div>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <CircleHelp className="h-5 w-5 text-warn mx-auto" />
            <div className="text-2xl font-bold tabular-nums mt-1">{unanswered}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Non répondu</div>
          </div>
        </Card>
      </div>

      {/* Barre de progression */}
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-gold" style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }} />
      </div>
      <div className="text-[11px] text-ink-3 -mt-2">
        {answered}/{total} répondues — l'agent monte en autonomie au fil de tes réponses.
      </div>

      <QuestionsList questions={TRAINING_QUESTIONS} answers={answers} customValues={customValues} />
    </div>
  );
}
