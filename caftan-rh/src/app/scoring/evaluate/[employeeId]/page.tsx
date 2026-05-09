import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EvaluationForm } from "./form";

export default async function EvaluatePage(props: PageProps<"/scoring/evaluate/[employeeId]">) {
  const { employeeId } = await props.params;
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, job_title")
    .eq("id", employeeId)
    .single();
  if (!data) notFound();
  const e = data as unknown as { id: string; full_name: string; job_title: string | null };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/scoring/${employeeId}`}><ArrowLeft className="h-3.5 w-3.5" /> Retour fiche</Link>
      </Button>
      <Card>
        <div className="p-4 border-b border-line">
          <h1 className="text-xl font-bold">Nouvelle évaluation</h1>
          <p className="text-sm text-ink-2">{e.full_name} · {e.job_title}</p>
        </div>
        <EvaluationForm employeeId={e.id} />
      </Card>
    </div>
  );
}
