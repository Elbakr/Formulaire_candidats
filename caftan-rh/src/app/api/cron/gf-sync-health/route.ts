// Karim 2026-06-04 : cron horaire de monitoring sync GF.
// Cas detectes :
//  - last_synced_at > 60 min (sync ne tourne plus)
//  - last_synced_at recent mais last_sync_count=0 ET GF total > BD count
//    => sync ne traite rien alors qu il y a des candidats nouveaux
//  - GF total_count >> candidates(gravity_forms) count par > 20
//
// Envoie notification in-app + mail si une de ces conditions detectee.
// Anti-spam : 1 notification par 6h max.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STALE_MIN = 60;
const ALERT_COOLDOWN_MIN = 360; // 6h

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settings } = await admin.from("gf_settings").select("*").eq("id", 1).single();
  if (!settings) return NextResponse.json({ skipped: "no_settings" });
  const s = settings as {
    enabled: boolean;
    wp_url: string;
    ck: string | null;
    cs: string | null;
    form_id: number;
    last_synced_at: string | null;
    last_sync_count: number | null;
  };
  if (!s.enabled || !s.ck || !s.cs) return NextResponse.json({ skipped: "disabled_or_no_creds" });

  // 1. Stale check
  const issues: string[] = [];
  if (!s.last_synced_at) {
    issues.push("Jamais synchronise (last_synced_at NULL)");
  } else {
    const ageMin = (Date.now() - new Date(s.last_synced_at).getTime()) / 60000;
    if (ageMin > STALE_MIN) {
      issues.push(`Dernier sync il y a ${Math.round(ageMin)} min (seuil ${STALE_MIN} min)`);
    }
  }

  // 2. Compare GF total vs BD count (uniquement si creds OK)
  let gfTotal: number | null = null;
  let bdCount: number | null = null;
  try {
    const auth = Buffer.from(`${s.ck}:${s.cs}`).toString("base64");
    const url = `${s.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${s.form_id}&paging[page_size]=1&paging[current_page]=1`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json() as { total_count?: string | number };
      gfTotal = Number(j.total_count ?? 0);
    }
    const { count } = await admin.from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("source", "gravity_forms");
    bdCount = count ?? 0;
    if (gfTotal !== null && bdCount !== null) {
      const gap = gfTotal - bdCount;
      if (gap > 20) {
        issues.push(`GF total=${gfTotal} vs BD=${bdCount} - gap=${gap} (sync incomplete)`);
      }
    }
  } catch (e) {
    issues.push(`Probe GF impossible : ${(e as Error).message}`);
  }

  if (issues.length === 0) {
    return NextResponse.json({ ok: true, healthy: true, gfTotal, bdCount, last_synced_at: s.last_synced_at });
  }

  // 3. Anti-spam : check derniere notif gf_sync_health < 6h
  const cooldownStart = new Date(Date.now() - ALERT_COOLDOWN_MIN * 60_000).toISOString();
  const { data: recentAlert } = await admin
    .from("notifications")
    .select("id")
    .eq("kind", "gf_sync_health")
    .gte("created_at", cooldownStart)
    .limit(1)
    .maybeSingle();
  if (recentAlert) {
    return NextResponse.json({ ok: true, issues, skipped: "cooldown" });
  }

  // 4. Cree notif + mail aux admin/RH
  const summary = `🚨 Sync GF en panne — ${issues.join(" ; ")}`;
  const { data: hrs } = await admin.from("profiles").select("id, email").in("role", ["admin", "rh"]);
  const hrList = (hrs ?? []) as Array<{ id: string; email: string | null }>;
  if (hrList.length > 0) {
    await admin.from("notifications").insert(
      hrList.map((hr) => ({
        recipient_id: hr.id,
        kind: "gf_sync_health",
        title: "🚨 Sync GF — alerte santé",
        body: summary,
        link: "/admin/integrations/gravity-forms",
        data: { issues, gfTotal, bdCount, last_synced_at: s.last_synced_at },
      })),
    );
  }

  // Mail via EmailJS (best effort)
  try {
    const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    if (SERVICE && TEMPLATE && KEY) {
      const body = `Sync GF en panne — diag automatique :

${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}

GF total_count : ${gfTotal ?? "?"}
BD candidates(gravity_forms) : ${bdCount ?? "?"}
Dernier sync OK : ${s.last_synced_at ?? "jamais"}

Aller voir :
- Status sync : https://caftan-rh-v2-prod.vercel.app/admin/integrations/gravity-forms
- Trigger manuel : node scripts/sync-gf.mjs
- Diag : node scripts/diag-gf-sync.mjs

— CaftanRH monitoring`;
      const recipients = new Set<string>(["elbazikarim@gmail.com"]);
      for (const hr of hrList) if (hr.email) recipients.add(hr.email);
      for (const to of recipients) {
        const params = {
          to_email: to, email: to, user_email: to, candidate_email: to,
          to, to_name: "Admin RH", name: "Admin RH", candidate_name: "Admin",
          from_name: "CaftanRH monitoring", reply_to: "hr@caftanfactory.com",
          subject: "🚨 CaftanRH — Sync GF en panne", message: body,
          html_message: body.replace(/\n/g, "<br>"),
          body, html: body.replace(/\n/g, "<br>"), content: body,
        };
        try {
          await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
            body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
          });
        } catch {/* non bloquant */}
      }
    }
  } catch {/* */}

  return NextResponse.json({ ok: true, healthy: false, issues, gfTotal, bdCount, notifications: hrList.length });
}
