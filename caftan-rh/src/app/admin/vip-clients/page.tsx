import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VipAdmin } from "./vip-admin";

export default async function AdminVipPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const [
    { data: clients },
    { data: sellers },
    { data: sites },
    { data: visits },
  ] = await Promise.all([
    supabase
      .from("vip_clients")
      .select(
        "id, full_name, phone, email, dress_size, color_prefs, language, notes, birth_date, preferred_site_id, preferred_seller_id, is_active, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("sites").select("id, code, name").order("code"),
    supabase
      .from("vip_visits")
      .select("id, client_id, visited_at, kind, notes, follow_up_date, seller_id, site_id")
      .order("visited_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <VipAdmin
      clients={(clients ?? []) as never}
      sellers={(sellers ?? []) as never}
      sites={(sites ?? []) as never}
      visits={(visits ?? []) as never}
    />
  );
}
