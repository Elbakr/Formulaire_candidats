// Karim 2026-07-11 : moniteur sync GF — RÉÉCRIT pour tuer les faux positifs qui
// spammaient l'admin chaque jour. Diagnostic prouvé : 0 candidat perdu ; le
// "gap" historique = des RE-CANDIDATURES (mêmes emails re-postulés), pas des
// pertes. Deux corrections de fond :
//   1) On compare DU COMPARABLE : total d'entrées GF (brut) vs `last_sync_fetched`
//      (entrées RÉELLEMENT récupérées au dernier sync) — plus jamais "entrées vs
//      candidats uniques" (gap structurel qui ne se referme jamais).
//   2) Seuil de fraîcheur RÉALISTE (les crons GitHub Actions se décalent) : on
//      n'alerte sur l'âge QUE s'il y a en plus des entrées non importées, ou après
//      une très longue panne (>6h). Les erreurs de DÉDUP bénignes sont ignorées
//      (le sync ne compte que les erreurs RÉELLES dans last_sync_error_count).
// Anti-spam : 1 notification par 12h max.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";

export const dynamic = "force-dynamic";

const HARD_STALE_MIN = 360; // 6h : panne réelle (bien au-delà du jitter GitHub Actions)
const BACKLOG_THRESHOLD = 25; // entrées GF non encore récupérées tolérées
const ALERT_COOLDOWN_MIN = 720; // 12h

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
    last_sync_fetched: number | null;
    last_sync_error_count: number | null;
  };
  if (!s.enabled || !s.ck || !s.cs) return NextResponse.json({ skipped: "disabled_or_no_creds" });

  const issues: string[] = [];
  const ageMin = s.last_synced_at
    ? (Date.now() - new Date(s.last_synced_at).getTime()) / 60000
    : Infinity;

  // 1. Total GF (brut) vs entrées RÉELLEMENT récupérées au dernier sync : le SEUL
  //    "gap" qui a un sens. Si le sync a tout récupéré, aucun retard, quel que soit
  //    l'âge (les doublons/re-candidatures ne comptent pas comme un manque).
  let gfTotal: number | null = null;
  let backlog: number | null = null;
  try {
    const auth = Buffer.from(`${s.ck}:${s.cs}`).toString("base64");
    const url = `${s.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${s.form_id}&paging[page_size]=1&paging[current_page]=1`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { total_count?: string | number };
      gfTotal = Number(j.total_count ?? 0);
    }
    if (gfTotal !== null && s.last_sync_fetched != null) {
      backlog = gfTotal - s.last_sync_fetched;
      if (backlog > BACKLOG_THRESHOLD) {
        issues.push(
          `${backlog} entrée(s) GF pas encore importée(s) (total GF ${gfTotal}, dernier sync a récupéré ${s.last_sync_fetched})`,
        );
      }
    }
  } catch (e) {
    // Probe GF KO : on ne crie pas pour ça seul (l'API WP peut hoqueter). On le
    // signalera seulement combiné à une vraie panne de fraîcheur ci-dessous.
    if (ageMin > HARD_STALE_MIN) issues.push(`Probe GF impossible : ${(e as Error).message}`);
  }

  // 2. Erreurs RÉELLES au dernier sync (hors dédup bénigne).
  if ((s.last_sync_error_count ?? 0) > 0) {
    issues.push(`${s.last_sync_error_count} erreur(s) réelle(s) au dernier sync`);
  }

  // 3. Fraîcheur : n'alerte QUE si retard important (jitter GitHub Actions absorbé),
  //    et seulement si le sync n'a jamais tourné OU s'il y a un backlog à importer.
  if (!s.last_synced_at) {
    issues.push("Jamais synchronisé (last_synced_at NULL)");
  } else if (ageMin > HARD_STALE_MIN && (backlog == null || backlog > BACKLOG_THRESHOLD)) {
    issues.push(`Aucun sync réussi depuis ${Math.round(ageMin)} min (seuil ${HARD_STALE_MIN} min)`);
  }

  if (issues.length === 0) {
    return NextResponse.json({
      ok: true,
      healthy: true,
      gfTotal,
      lastFetched: s.last_sync_fetched,
      backlog,
      last_synced_at: s.last_synced_at,
    });
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
    const firstIssue = issues[0] ?? "problème inconnu";
    await admin.from("notifications").insert(
      hrList.map((hr) => ({
        recipient_id: hr.id,
        kind: "gf_sync_health",
        title: `🚨 Sync Gravity Forms — ${firstIssue.slice(0, 80)}`,
        body: `${issues.length} problème(s) détecté(s) sur la sync GF :\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}\nGF total : ${gfTotal ?? "?"} | Dernier sync a récupéré : ${s.last_sync_fetched ?? "?"} | Backlog : ${backlog ?? "?"}`,
        link: "/admin/integrations/gravity-forms",
        data: { issues, gfTotal, lastFetched: s.last_sync_fetched, backlog, last_synced_at: s.last_synced_at },
      })),
    );
  }

  // Mail via sendAppMail (best effort)
  try {
    const base = getPublicBaseUrl();
    const body = `Sync GF en panne — diag automatique :

${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}

GF total_count : ${gfTotal ?? "?"}
Dernier sync a récupéré : ${s.last_sync_fetched ?? "?"} entrées (backlog : ${backlog ?? "?"})
Dernier sync OK : ${s.last_synced_at ?? "jamais"}

Aller voir :
- Status sync : ${base}/admin/integrations/gravity-forms
- Trigger manuel : node scripts/sync-gf.mjs
- Diag : node scripts/diag-gf-sync.mjs

— CaftanRH monitoring`;
    const recipients = new Set<string>(["elbazikarim@gmail.com"]);
    for (const hr of hrList) if (hr.email) recipients.add(hr.email);
    for (const to of recipients) {
      try {
        await sendAppMail({
          to,
          toName: "Admin RH",
          subject: "🚨 CaftanRH — Sync GF en panne",
          body,
          source: "gf_sync_health",
        });
      } catch {/* non bloquant */}
    }
  } catch {/* */}

  return NextResponse.json({ ok: true, healthy: false, issues, gfTotal, backlog, notifications: hrList.length });
}
