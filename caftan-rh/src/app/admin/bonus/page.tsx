import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BonusAdmin } from "./bonus-admin";

export default async function BonusAdminPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [
    { data: campaignsRaw },
    { data: awardsRaw },
    { data: sitesRaw },
    { data: empsRaw },
  ] = await Promise.all([
    supabase
      .from("bonus_campaigns")
      .select(
        "id, name, description, start_date, end_date, rule_kind, budget_total, per_person_max, prize_distribution, scope_site_id, is_active, created_at",
      )
      .order("start_date", { ascending: false }),
    supabase
      .from("bonus_awards")
      .select(
        "id, campaign_id, employee_id, amount, rank, reason, paid_at, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("sites").select("id, code, name").order("code"),
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  return (
    <BonusAdmin
      campaigns={(campaignsRaw ?? []) as never}
      awards={(awardsRaw ?? []) as never}
      sites={(sitesRaw ?? []) as never}
      employees={(empsRaw ?? []) as never}
    />
  );
}
