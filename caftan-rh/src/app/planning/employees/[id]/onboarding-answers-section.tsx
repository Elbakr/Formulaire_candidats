// Karim 2026-07-06 : section « Questionnaire d'accueil » sur la fiche RH du
// travailleur. Affiche, en lecture seule, chaque question + réponse du
// questionnaire d'onboarding (pre_interviews context='onboarding').

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { loadOnboardingAnswersForEmployee } from "@/lib/worker-onboarding-answers";

export async function OnboardingAnswersSection({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();
  let data: Awaited<ReturnType<typeof loadOnboardingAnswersForEmployee>> = null;
  try {
    data = await loadOnboardingAnswersForEmployee(admin, employeeId);
  } catch {
    /* best effort — ne casse pas la fiche */
  }

  const completedLabel = data?.completedAt
    ? new Date(data.completedAt).toLocaleDateString("fr-BE", {
        timeZone: "Europe/Brussels",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card id="onboarding-answers" className="overflow-hidden">
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Questionnaire d&apos;accueil
        </h2>
        <p className="text-[10px] text-ink-3 mt-0.5">
          Réponses au questionnaire d&apos;onboarding rempli par le travailleur.
          {completedLabel ? ` Complété le ${completedLabel}.` : ""}
        </p>
      </div>

      {!data || data.answers.length === 0 ? (
        <div className="p-4 text-center text-xs text-ink-3">Pas encore rempli.</div>
      ) : (
        <div className="divide-y divide-line">
          {data.answers.map((a) => (
            <div key={a.questionId} className="p-4">
              <div className="text-xs font-semibold text-ink-2">{a.prompt}</div>
              <div className="text-sm text-ink mt-1 whitespace-pre-wrap break-words">
                {renderAnswer(a)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function renderAnswer(a: {
  kind: string;
  answerText: string | null;
  answerScale: number | null;
  choiceLabels: string[];
}): React.ReactNode {
  if (a.kind === "scale_1_5") {
    return a.answerScale != null ? `${a.answerScale}/5` : <EmptyAnswer />;
  }
  if (a.kind === "single_choice" || a.kind === "multi_choice") {
    return a.choiceLabels.length > 0 ? a.choiceLabels.join(", ") : <EmptyAnswer />;
  }
  // text / video (fallback texte)
  const txt = (a.answerText ?? "").trim();
  return txt.length > 0 ? txt : <EmptyAnswer />;
}

function EmptyAnswer() {
  return <span className="text-ink-3 italic">Sans réponse</span>;
}
