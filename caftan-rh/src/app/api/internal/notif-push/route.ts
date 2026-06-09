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

  try {
    const result = await sendPushToProfile(notif.recipient_id, {
      title: notif.title,
      body: notif.body ?? "",
      link: notif.link ?? null,
      priority,
      tag: `notif-${notif.id}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.warn(`[notif-push] sendPushToProfile error for notif ${notifId}:`, (e as Error).message);
    return NextResponse.json({ ok: true, error: (e as Error).message });
  }
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
