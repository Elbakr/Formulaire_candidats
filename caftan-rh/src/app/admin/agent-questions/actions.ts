"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordLearning, revokeLearning } from "@/lib/incident/learnings";
import { isValidTrainingAnswer, trainingModeFor } from "@/lib/incident/agent-questions";

// Les réponses aux questions d'apprentissage sont stockées sous signature "policy".
const SIG = "policy";

export async function answerTrainingQuestion(
  qid: string,
  optionKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin"]);
  if (!isValidTrainingAnswer(qid, optionKey)) return { ok: false, error: "Réponse invalide." };
  await recordLearning({
    signature: SIG,
    questionKey: qid,
    option: optionKey,
    mode: trainingModeFor(qid, optionKey),
    decidedBy: profile.id,
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
