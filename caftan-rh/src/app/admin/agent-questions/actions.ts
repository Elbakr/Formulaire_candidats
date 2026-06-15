"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordLearning, revokeLearning } from "@/lib/incident/learnings";
import {
  isValidTrainingAnswer,
  trainingModeFor,
  parseTrainingCustomAnswer,
  questionById,
} from "@/lib/incident/agent-questions";

// Les réponses aux questions d'apprentissage sont stockées sous signature "policy".
const SIG = "policy";

/**
 * Enregistre la réponse d'une question d'entraînement.
 * Si optionKey === "custom", customValue doit être fourni et valide.
 */
export async function answerTrainingQuestion(
  qid: string,
  optionKey: string,
  customValue?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin"]);
  if (!isValidTrainingAnswer(qid, optionKey, customValue)) {
    return { ok: false, error: "Réponse invalide." };
  }

  let resolvedCustomValue: string | undefined;
  if (optionKey === "custom") {
    const q = questionById(qid);
    if (!q) return { ok: false, error: "Question introuvable." };
    const parsed = parseTrainingCustomAnswer(q, customValue ?? "");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    resolvedCustomValue = parsed.value;
  }

  await recordLearning({
    signature: SIG,
    questionKey: qid,
    option: optionKey,
    mode: trainingModeFor(qid, optionKey),
    decidedBy: profile.id,
    customValue: resolvedCustomValue,
  });
  revalidatePath("/admin/agent-questions");
  return { ok: true };
}

export async function revokeTrainingQuestion(qid: string): Promise<{ ok: boolean }> {
  await requireRole(["admin"]);
  await revokeLearning(SIG, qid);
  revalidatePath("/admin/agent-questions");
  return { ok: true };
}
