import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { previewSitePlanAdmin } from "@/lib/auto-plan-runner";
import { addDays, startOfWeek, toISODate } from "@/lib/planning";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  // Lundi de la SEMAINE PROCHAINE (sept jours après le lundi de cette semaine).
  const today = new Date();
  const thisMonday = startOfWeek(today);
  const nextMonday = addDays(thisMonday, 7);
  const nextMondayISO = toISODate(nextMonday);

  // Sites actifs
  const { data: sites } = await admin
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("sort_order");
  type SiteRow = { id: string; code: string; name: string };
  const siteRows = (sites ?? []) as SiteRow[];

  let inserted = 0;
  let skipped = 0;
  const failures: { site: string; error: string }[] = [];

  for (const s of siteRows) {
    // Évite de re-générer si déjà un brouillon pending pour cette semaine.
    const { data: existing } = await admin
      .from("auto_plan_drafts")
      .select("id")
      .eq("site_id", s.id)
      .eq("week_monday", nextMondayISO)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    let preview: Awaited<ReturnType<typeof previewSitePlanAdmin>>;
    try {
      preview = await previewSitePlanAdmin(s.code, nextMondayISO);
    } catch (err) {
      failures.push({
        site: s.code,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if ("error" in preview) {
      failures.push({ site: s.code, error: preview.error });
      continue;
    }

    const { error: insErr } = await admin.from("auto_plan_drafts").insert({
      site_id: s.id,
      week_monday: nextMondayISO,
      generated_by: "cron",
      status: "pending",
      drafts_json: preview.drafts,
      uncovered_json: preview.uncovered,
      contract_usage_json: preview.contract_usage,
    });
    if (insErr) {
      failures.push({ site: s.code, error: insErr.message });
      continue;
    }
    inserted += 1;

    // Notifie le groupe-site (chat) — message dans le site_group room.
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", s.id)
      .maybeSingle();
    if (room) {
      await admin.from("chat_messages").insert({
        room_id: (room as { id: string }).id,
        author_profile_id: null,
        body:
          `Planning pré-généré pour la semaine du ${nextMondayISO} — ` +
          `${preview.drafts.length} shifts proposés, ` +
          `${preview.uncovered.length} créneaux à compléter. ` +
          `Validation manager attendue (/planning/auto-drafts).`,
      });
    }
  }

  // Notifie tous les managers + RH via notification.
  const { data: managers } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "rh", "manager"]);
  const mgrIds = ((managers ?? []) as { id: string }[]).map((p) => p.id);
  if (inserted > 0 && mgrIds.length > 0) {
    const rows = mgrIds.map((id) => ({
      recipient_id: id,
      kind: "auto_plan_ready",
      title: "Planning auto pré-généré",
      body: `${inserted} site(s) prêt(s) à valider pour la semaine du ${nextMondayISO}.`,
      link: "/planning/auto-drafts",
      data: { week_monday: nextMondayISO, sites: inserted },
    }));
    await admin.from("notifications").insert(rows);
  }

  return NextResponse.json({
    ok: true,
    week_monday: nextMondayISO,
    inserted,
    skipped,
    failures,
  });
}
