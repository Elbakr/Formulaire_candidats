import { AlertCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AdminAbsencesClient } from "./client";

export default async function AdminAbsencesPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: absencesRaw } = await supabase
    .from("unplanned_absences")
    .select(
      "id, date, reason, status, justification_url, notes, reported_at, resolved_at, employee:employees!unplanned_absences_employee_id_fkey(id, full_name), replacement:employees!unplanned_absences_replacement_employee_id_fkey(id, full_name), shift:shifts(date, start_time, end_time, site:sites(code, name))",
    )
    .order("reported_at", { ascending: false })
    .limit(150);

  const absences = (absencesRaw ?? []) as unknown as Array<{
    id: string;
    date: string;
    reason: string;
    status: string;
    justification_url: string | null;
    notes: string | null;
    reported_at: string;
    resolved_at: string | null;
    employee: { id: string; full_name: string } | null;
    replacement: { id: string; full_name: string } | null;
    shift: {
      date: string;
      start_time: string;
      end_time: string;
      site: { code: string; name: string } | null;
    } | null;
  }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-7 w-7 text-danger" />
        <div>
          <h1 className="text-2xl font-bold">Absences imprévues</h1>
          <p className="text-sm text-ink-2">
            Toutes les absences signalées récemment et leur statut de couverture.
          </p>
        </div>
      </div>

      {absences.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucune absence signalée.
          </div>
        </Card>
      ) : (
        <AdminAbsencesClient absences={absences} />
      )}
    </div>
  );
}
