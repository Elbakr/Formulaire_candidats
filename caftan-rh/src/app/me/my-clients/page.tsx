import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { MyClientsApp } from "./my-clients-app";

export const dynamic = "force-dynamic";

export default async function MyClientsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = empRaw as { id: string; full_name: string } | null;

  if (!employee) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Mes clientes VIP</h1>
        </div>
        <Card>
          <div className="p-6 text-sm text-ink-2">
            Tu dois être un employé actif pour gérer une clientèle VIP. Contacte
            la RH si ce n'est pas le cas.
          </div>
        </Card>
      </div>
    );
  }

  // Mes clientes : preferred_seller_id = mon employee_id, actives.
  const { data: clientsRaw } = await supabase
    .from("vip_clients")
    .select(
      "id, full_name, phone, email, dress_size, color_prefs, language, notes, birth_date, preferred_site_id, preferred_seller_id, is_active, created_at",
    )
    .eq("preferred_seller_id", employee.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  // Toutes les visites pour mes clientes (limitées 200 pour perf).
  const clientIds = ((clientsRaw ?? []) as Array<{ id: string }>).map((c) => c.id);
  const { data: visitsRaw } = clientIds.length
    ? await supabase
        .from("vip_visits")
        .select(
          "id, client_id, visited_at, kind, notes, follow_up_date, seller_id, site_id",
        )
        .in("client_id", clientIds)
        .order("visited_at", { ascending: false })
        .limit(200)
    : { data: [] };

  const { data: sites } = await supabase.from("sites").select("id, code, name").order("code");

  return (
    <MyClientsApp
      myEmployeeId={employee.id}
      clients={(clientsRaw ?? []) as never}
      visits={(visitsRaw ?? []) as never}
      sites={(sites ?? []) as never}
    />
  );
}
