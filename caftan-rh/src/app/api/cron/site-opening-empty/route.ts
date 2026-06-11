// GET /api/cron/site-opening-empty — Karim 2026-06-11.
//
// Alerte push si AUCUNE presence sur un site ~5 min apres son heure d'ouverture.
// A cadencer toutes les 5 min (meme schedule que tuya-poll). Fenetre [5, 30[ min
// apres l'ouverture + dedup 1x/site/jour pour absorber le jitter des crons.
//
// Heure d'ouverture = plus petit start_time des site_needs actifs du jour
// (meme source que l'auto-close). Tout est calcule en Europe/Brussels.
//
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WINDOW_START_MIN = 5;   // on alerte a partir de 5 min apres l'ouverture
const WINDOW_END_MIN = 30;    // ...et jusqu'a 30 min (jitter cron), 1 seule fois

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHHMM(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  // Maintenant, en Europe/Brussels.
  const bxParts = (opt: Intl.DateTimeFormatOptions) =>
    new Date().toLocaleString("en-US", { timeZone: "Europe/Brussels", ...opt });
  const nowMinutes = Number(bxParts({ hour: "2-digit", hour12: false })) * 60 + Number(bxParts({ minute: "2-digit" }));
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = wk[bxParts({ weekday: "short" })] ?? 0;
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" }); // YYYY-MM-DD

  // Heure d'ouverture du jour par site (min start_time des needs actifs).
  const { data: needs } = await admin
    .from("site_needs")
    .select("site_id, start_time")
    .eq("day_of_week", dow)
    .eq("is_enabled", true);
  const openBySite = new Map<string, number>();
  for (const n of (needs ?? []) as Array<{ site_id: string; start_time: string }>) {
    const m = toMin(n.start_time);
    if (!openBySite.has(n.site_id) || m < (openBySite.get(n.site_id) as number)) openBySite.set(n.site_id, m);
  }
  if (openBySite.size === 0) {
    return NextResponse.json({ ok: true, checked: 0, alerts: 0, reason: "aucune ouverture aujourd'hui" });
  }

  // Sites presents en ce moment.
  const { data: present } = await admin.from("clock_currently_in").select("site_id");
  const presentSites = new Set(((present ?? []) as Array<{ site_id: string | null }>).map((p) => p.site_id));

  // Sites actifs (noms).
  const { data: sites } = await admin
    .from("sites").select("id, name, code, is_active").in("id", [...openBySite.keys()]);
  const siteById = new Map(((sites ?? []) as Array<{ id: string; name: string; code: string; is_active: boolean }>).map((s) => [s.id, s]));

  const toAlert: Array<{ siteId: string; name: string; code: string; openMin: number }> = [];
  for (const [siteId, openMin] of openBySite) {
    const site = siteById.get(siteId);
    if (!site || !site.is_active) continue;
    const since = nowMinutes - openMin;
    if (since < WINDOW_START_MIN || since >= WINDOW_END_MIN) continue; // hors fenetre
    if (presentSites.has(siteId)) continue;                            // quelqu'un est la
    // Dedup : deja alerte pour ce site aujourd'hui ?
    const { data: existing } = await admin
      .from("notifications").select("id")
      .eq("kind", "site_opening_empty")
      .eq("data->>siteId", siteId)
      .eq("data->>date", todayISO)
      .limit(1);
    if (existing && existing.length > 0) continue;
    toAlert.push({ siteId, name: site.name, code: site.code, openMin });
  }

  let notified = 0;
  if (toAlert.length > 0) {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
    const { sendPushToProfile } = await import("@/lib/push-notify");
    for (const a of toAlert) {
      const title = `🚪 Personne au magasin ${a.code ?? a.name}`;
      const body = `Aucun pointage à ${a.name}, ${nowMinutes - a.openMin} min après l'ouverture (${minToHHMM(a.openMin)}). Personne n'a badgé.`;
      for (const rid of adminIds) {
        const { data: ins } = await admin
          .from("notifications")
          .insert({ recipient_id: rid, kind: "site_opening_empty", title, body, link: "/admin/presence", data: { siteId: a.siteId, date: todayISO } })
          .select("id").single();
        if (!ins) continue;
        notified++;
        try {
          await sendPushToProfile(rid, { title, body, link: "/admin/presence", priority: "urgent", tag: `site-empty-${a.siteId}` });
        } catch { /* push best-effort */ }
      }
    }
  }

  return NextResponse.json({ ok: true, checked: openBySite.size, alerts: toAlert.length, notified, dow, todayISO });
}
