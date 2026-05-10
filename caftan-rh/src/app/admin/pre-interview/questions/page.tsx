import Link from "next/link";
import { ArrowLeft, ListChecks, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuestionsManager } from "./questions-manager";
import type { PreInterviewQuestion } from "@/lib/pre-interview-types";

export default async function PreInterviewQuestionsPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("pre_interview_questions")
    .select(
      "id, slug, position_role, language_code, prompt, kind, choices, min_chars, max_chars, is_required, sort_order, is_active, video_max_seconds",
    )
    .order("position_role", { ascending: true })
    .order("sort_order", { ascending: true });

  const questions = (data ?? []) as PreInterviewQuestion[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/pre-interview">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-gold-dark" /> Banque de questions
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            Définissez les questions posées aux candidats lors du pré-entretien écrit.
            Les questions <code className="font-mono bg-surface-2 px-1 rounded">all</code>{" "}
            s&apos;appliquent à tous les rôles, les autres uniquement au rôle ciblé.
          </p>
        </div>
        <div className="p-4">
          <QuestionsManager initialQuestions={questions} />
        </div>
      </Card>
    </div>
  );
}
