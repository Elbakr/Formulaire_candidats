import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { LifeBuoy } from "lucide-react";
import { ReinforcementForm } from "./reinforcement-form";
import { ReinforcementList } from "./reinforcement-list";

export const dynamic = "force-dynamic";

export default async function ReinforcementPage(props: PageProps<"/planning/reinforcement">) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await props.searchParams;
  const presetDate =
    typeof sp.date === "string" ? sp.date : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: sites }, { data: requestsRaw }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("reinforcement_requests")
      .select(
        `id, site_id, date, start_time, end_time, position, notes, status,
         proposed_employee_id, proposed_at, responded_at, expires_at, created_at,
         site:sites(code, name),
         employee:employees!reinforcement_requests_proposed_employee_id_fkey(full_name)`,
      )
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  type RawRow = {
    id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    notes: string | null;
    status: string;
    proposed_employee_id: string | null;
    proposed_at: string | null;
    responded_at: string | null;
    expires_at: string | null;
    created_at: string;
    site: { code: string; name: string } | null;
    employee: { full_name: string } | null;
  };
  const requests = ((requestsRaw ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    site_id: r.site_id,
    site_code: r.site?.code ?? "?",
    site_name: r.site?.name ?? "—",
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    position: r.position,
    notes: r.notes,
    status: r.status,
    proposed_employee_id: r.proposed_employee_id,
    proposed_employee_name: r.employee?.full_name ?? null,
    proposed_at: r.proposed_at,
    responded_at: r.responded_at,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));

  type SiteRow = { id: string; code: string; name: string; color: string | null };
  const siteOptions = ((sites ?? []) as SiteRow[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    color: s.color,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-gold-dark" /> Demande de renfort
        </h1>
        <p className="text-sm text-ink-2 ml-1">
          Manager déclare un besoin → employé classé par proximité → 1 clic pour proposer.
        </p>
      </div>

      <ReinforcementList requests={requests} />

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Nouvelle demande</h2>
          <p className="text-xs text-ink-3">
            La proposition expire automatiquement après 4h sans réponse.
          </p>
        </div>
        <div className="p-4">
          <ReinforcementForm sites={siteOptions} presetDate={presetDate} />
        </div>
      </Card>
    </div>
  );
}
