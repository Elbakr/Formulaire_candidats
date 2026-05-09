import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncGravityForms, type GFFieldMap, type GFSettings } from "@/lib/gravity-forms";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin.from("gf_settings").select("*").eq("id", 1).single();
  const settings = data as unknown as {
    wp_url: string; ck: string | null; cs: string | null; form_id: number;
    field_map: GFFieldMap; enabled: boolean;
  } | null;

  if (!settings) return NextResponse.json({ error: "no_settings" }, { status: 404 });
  if (!settings.enabled) return NextResponse.json({ skipped: "disabled" });
  if (!settings.ck || !settings.cs) return NextResponse.json({ skipped: "no_credentials" });

  const gfSettings: GFSettings = {
    wp_url: settings.wp_url,
    ck: settings.ck,
    cs: settings.cs,
    form_id: settings.form_id,
    field_map: settings.field_map,
  };

  const stats = await syncGravityForms(gfSettings, admin as unknown as Parameters<typeof syncGravityForms>[1]);

  await admin
    .from("gf_settings")
    .update({ last_synced_at: new Date().toISOString(), last_sync_count: stats.created })
    .eq("id", 1);

  return NextResponse.json({ ok: true, stats });
}
