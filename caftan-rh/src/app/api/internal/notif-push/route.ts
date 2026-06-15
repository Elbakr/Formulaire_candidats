// Karim 2026-06-09 : endpoint appele automatiquement par le trigger
// Postgres `trg_notify_push_after_insert` apres chaque INSERT dans
// public.notifications. Lit la notification depuis DB puis appelle
// sendPushToProfile() pour pousser vers les abonnements actifs.
//
// Auth : Bearer CRON_SECRET (meme secret que les autres crons internes).
// Le trigger lit ce secret depuis public.app_secrets table.
//
// Best-effort : retourne 200 meme en cas d'erreur cote push (warning),
// pour eviter que pg_net retry indefiniment. Les erreurs sont logguees.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "@/lib/push-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { notif_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const notifId = body.notif_id;
  if (!notifId || typeof notifId !== "string") {
    return NextResponse.json({ ok: false, error: "notif_id missing" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: notif, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, kind, title, body, link, data, created_at")
    .eq("id", notifId)
    .single();

  if (error || !notif) {
    console.warn(`[notif-push] notification introuvable: ${notifId}`, error?.message);
    return NextResponse.json({ ok: true, skipped: "not-found" });
  }

  const priority = mapPriority(notif.kind, (notif.data as Record<string, unknown> | null) ?? null);

  // Karim 2026-06-15 : ANTI-RÉCIDIVE clic push -> page de destination.
  // Point de passage UNIQUE de tous les push : si la notif n'a pas de `link`
  // exploitable (oubli à l'insert, ou course pg_net quand le link est posé via
  // un UPDATE après l'insert -> le trigger lit la ligne avant), on dérive une
  // destination depuis le kind + data au lieu de retomber bêtement sur "/".
  // Couvre TOUTES les sources de notif, présentes et futures, en un seul endroit.
  const rawLink = typeof notif.link === "string" ? notif.link.trim() : "";
  const link = rawLink && rawLink !== "/"
    ? normalizeLink(rawLink)
    : fallbackLink(notif.kind, (notif.data as Record<string, unknown> | null) ?? null);

  try {
    const result = await sendPushToProfile(notif.recipient_id, {
      title: notif.title,
      body: notif.body ?? "",
      link,
      priority,
      tag: `notif-${notif.id}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.warn(`[notif-push] sendPushToProfile error for notif ${notifId}:`, (e as Error).message);
    return NextResponse.json({ ok: true, error: (e as Error).message });
  }
}

// Karim 2026-06-15 : défend aussi contre les liens écrits en backslashes
// (`\me\notifications\…`) — bug latent de certains call sites — en les
// normalisant en chemin URL propre.
function normalizeLink(link: string): string {
  let l = link.replace(/\\/g, "/").trim();
  if (!l) return "/m";
  if (!l.startsWith("/") && !l.startsWith("http")) l = "/" + l;
  return l;
}

// Dérive une destination plausible quand la notif n'a pas de `link`.
// Préfère un ID concret (employé, incident) présent dans `data`, sinon route
// par famille de `kind`, et en dernier recours le tableau de bord mobile (/m)
// — jamais l'accueil "/" qui faisait croire que « ça ne renvoie nulle part ».
function fallbackLink(
  kind: string | null | undefined,
  data: Record<string, unknown> | null,
): string {
  const d = data ?? {};
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const empId = pick("employee_id", "employeeId");
  const incId = pick("incident_id", "incidentId");
  const candId = pick("candidate_id", "candidateId", "application_id");
  const k = (kind ?? "").toLowerCase();

  if (incId) return `/admin/incidents/${incId}`;
  if (k.includes("incident")) return "/admin/incidents";
  if (k.includes("renewal") || k.includes("cdd")) return "/admin/cdd-renewals";
  if (k.includes("dimona") || k.includes("contract") || k.includes("signature") || k.includes("termination") || k.includes("contract_info")) {
    return empId ? `/planning/employees/${empId}` : "/planning/employees";
  }
  if (k.includes("training")) return "/rh/trainings";
  if (k.includes("absence") || k.includes("reinforcement") || k.includes("urgent")) return "/planning/reinforcement";
  if (k.includes("erasure") || k.includes("candidate") || k.includes("pre_interview") || k.includes("screening")) {
    return candId ? `/rh/candidates/${candId}` : "/rh/candidates";
  }
  if (k.includes("mail")) return "/rh/mails";
  if (empId) return `/planning/employees/${empId}`;
  return "/m";
}

function mapPriority(
  kind: string | null | undefined,
  data: Record<string, unknown> | null,
): "normal" | "important" | "urgent" {
  const explicit = data && typeof data["priority"] === "string" ? (data["priority"] as string) : null;
  if (explicit === "urgent" || explicit === "important" || explicit === "normal") return explicit;

  if (!kind) return "normal";
  const k = kind.toLowerCase();
  if (k.includes("urgent") || k.includes("absence") || k.includes("incident")) return "urgent";
  if (k.includes("dimona") || k.includes("contract") || k.includes("signature") || k.includes("renewal")) return "important";
  return "normal";
}
