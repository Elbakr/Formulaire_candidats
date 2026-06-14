// GET /api/cron/seed-training-questions — Karim 2026-06-14.
//
// Envoie UNE notification par question d'apprentissage NON répondue (≈25 au
// total), chacune pointant vers /admin/agent-questions. Idempotent : ne renvoie
// que les questions encore sans réponse. Auth : Bearer CRON_SECRET.
//
// ?all=1 force l'envoi de TOUTES les questions (même répondues).

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { TRAINING_QUESTIONS } from "@/lib/incident/agent-questions";
import { getLearningsForSignature } from "@/lib/incident/learnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forceAll = new URL(request.url).searchParams.get("all") === "1";

  const admin = createAdminClient();
  const learnings = await getLearningsForSignature("policy");
  const answered = new Set(learnings.map((l) => l.question_key ?? ""));
  const todo = forceAll ? TRAINING_QUESTIONS : TRAINING_QUESTIONS.filter((q) => !answered.has(q.id));

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);

  const link = "/admin/agent-questions";
  let notified = 0;
  for (const q of todo) {
    for (const rid of adminIds) {
      const { data: ins } = await admin.from("notifications").insert({
        recipient_id: rid,
        kind: "agent_question",
        title: `🎓 ${q.category} — apprends-moi`,
        body: `${q.question}\n\n(${q.why})\nClique pour répondre.`,
        data: { question_id: q.id, training_question: true, link },
      }).select("id").single();
      if (!ins) continue;
      await admin.from("notifications").update({ link }).eq("id", (ins as { id: string }).id);
      notified++;
    }
  }

  return NextResponse.json({ ok: true, questions_total: TRAINING_QUESTIONS.length, sent: todo.length, notified });
}
