import "server-only";

// Karim 2026-07-04 : capture ANTI-FRAUDE d'un accès candidat. Fire-and-forget :
// ne DOIT JAMAIS casser le flux candidat. Minimisation RGPD (voir migration).
// Sur Vercel, la géoloc pays/ville arrive GRATUITEMENT via les entêtes
// x-vercel-ip-* (pas d'API). Appelé UNIQUEMENT côté serveur (headers()).

import { headers } from "next/headers";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export type AccessContext = "postuler" | "contract_info" | "candidate_portal";

function deviceHint(ua: string | null): string {
  if (!ua) return "inconnu";
  const s = ua.toLowerCase();
  const os = /iphone|ipad|ipod/.test(s) ? "iOS"
    : /android/.test(s) ? "Android"
    : /windows/.test(s) ? "Windows"
    : /mac os|macintosh/.test(s) ? "Mac"
    : /linux/.test(s) ? "Linux" : "Autre";
  const br = /edg\//.test(s) ? "Edge"
    : /chrome|crios/.test(s) ? "Chrome"
    : /firefox|fxios/.test(s) ? "Firefox"
    : /safari/.test(s) ? "Safari" : "Navigateur";
  return `${os} · ${br}`;
}

export async function logCandidateAccess(opts: {
  candidateId: string | null;
  context: AccessContext;
  token?: string | null;
}): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
    const ua = h.get("user-agent") ?? null;
    const al = h.get("accept-language") ?? null;
    const country = h.get("x-vercel-ip-country");
    const region = h.get("x-vercel-ip-country-region");
    const cityRaw = h.get("x-vercel-ip-city");
    const city = cityRaw ? safeDecode(cityRaw) : null;
    const fp = crypto.createHash("sha256").update(`${ua ?? ""}|${al ?? ""}`).digest("hex").slice(0, 32);

    const admin = createAdminClient();

    // Throttle : évite les doublons (même candidat + IP + contexte) sous 1h.
    if (opts.candidateId) {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: recent } = await admin
        .from("candidate_access_logs")
        .select("id")
        .eq("candidate_id", opts.candidateId)
        .eq("context", opts.context)
        .eq("ip", ip)
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) return;
    }

    await admin.from("candidate_access_logs").insert({
      candidate_id: opts.candidateId,
      context: opts.context,
      token: opts.token ?? null,
      ip,
      ip_country: country,
      ip_region: region,
      ip_city: city,
      user_agent: ua,
      device_hint: deviceHint(ua),
      accept_language: al,
      ua_fingerprint: fp,
    });
  } catch {
    /* fire-and-forget : ne jamais casser le flux candidat */
  }
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
