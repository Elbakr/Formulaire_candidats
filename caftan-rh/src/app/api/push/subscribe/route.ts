import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Body : { endpoint, keys: { p256dh, auth }, userAgent? }
 * Stocke la subscription pour l'utilisateur courant. Idempotent sur l'endpoint
 * (réutilise la row existante et la réactive).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = payload.endpoint?.trim();
  const p256dh = payload.keys?.p256dh?.trim();
  const auth = payload.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  const existingId = (existing as { id: string } | null)?.id ?? null;

  if (existingId) {
    await admin
      .from("push_subscriptions")
      .update({
        profile_id: user.id,
        p256dh,
        auth,
        user_agent: payload.userAgent ?? null,
        is_active: true,
      })
      .eq("id", existingId);
    return NextResponse.json({ ok: true, id: existingId, reused: true });
  }

  const { data: ins, error } = await admin
    .from("push_subscriptions")
    .insert({
      profile_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: payload.userAgent ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  const admin = createAdminClient();
  await admin
    .from("push_subscriptions")
    .update({ is_active: false })
    .eq("endpoint", endpoint)
    .eq("profile_id", user.id);
  return NextResponse.json({ ok: true });
}
