import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EvaluationForm } from "./form";
import { EvaluationContextPanel } from "./context-panel";

export default async function EvaluatePage(props: PageProps<"/scoring/evaluate/[employeeId]">) {
  const { employeeId } = await props.params;
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, job_title, start_date, end_date")
    .eq("id", employeeId)
    .single();
  if (!data) notFound();
  const e = data as unknown as {
    id: string;
    full_name: string;
    job_title: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  // Karim 2026-07-08 : période par défaut = période du CONTRAT.
  // Source primaire = employees.start_date/end_date ; fallback = dernier contrat
  // signé (employee_contracts). Fin nulle = CDI => le form utilise "aujourd'hui".
  let contractStart: string | null = e.start_date ?? null;
  let contractEnd: string | null = e.end_date ?? null;
  if (!contractStart) {
    try {
      const admin = createAdminClient();
      const { data: cRaw } = await admin
        .from("employee_contracts")
        .select("start_date, end_date, signed_at")
        .eq("employee_id", employeeId)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const c = cRaw as { start_date: string | null; end_date: string | null } | null;
      if (c) {
        contractStart = c.start_date ?? null;
        if (!contractEnd) contractEnd = c.end_date ?? null;
      }
    } catch {
      /* non bloquant : le form retombera sur son défaut interne */
    }
  }

  // Le panneau contexte lit des tables RH-only (worker_compliance_events, etc.) —
  // réservé aux rôles admin/rh (les managers gardent la saisie d'évaluation).
  const canSeeContext = profile.role === "admin" || profile.role === "rh";

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/scoring/${employeeId}`}><ArrowLeft className="h-3.5 w-3.5" /> Retour fiche</Link>
      </Button>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
        <Card>
          <div className="p-4 border-b border-line">
            <h1 className="text-xl font-bold">Nouvelle évaluation</h1>
            <p className="text-sm text-ink-2">{e.full_name} · {e.job_title}</p>
          </div>
          <EvaluationForm
            employeeId={e.id}
            contractStart={contractStart}
            contractEnd={contractEnd}
          />
        </Card>

        {canSeeContext ? (
          <EvaluationContextPanel
            employeeId={e.id}
            contractStart={contractStart}
            contractEnd={contractEnd}
          />
        ) : null}
      </div>
    </div>
  );
}
