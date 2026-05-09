import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { Calendar } from "lucide-react";

export default async function ManagerCalendarPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: interviews } = await supabase
    .from("interviews")
    .select(`id, scheduled_at, duration_min, type, location, meeting_url, status,
             application:applications(id, candidate:candidates(full_name, email))`)
    .eq("interviewer", profile.id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mon agenda</h1>
        <p className="text-sm text-ink-2">Tes prochains entretiens.</p>
      </div>

      {(!interviews || interviews.length === 0) ? (
        <Card>
          <div className="p-10 text-center">
            <Calendar className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Aucun entretien planifié.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {interviews.map((iv) => {
            const cand = (iv.application as { candidate?: { full_name?: string } } | null)?.candidate;
            return (
              <Card key={iv.id}>
                <div className="p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{cand?.full_name ?? "—"}</div>
                    <div className="text-xs text-ink-2">
                      {formatDateTime(iv.scheduled_at)} · {iv.duration_min} min · {iv.type}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2">{iv.status}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
