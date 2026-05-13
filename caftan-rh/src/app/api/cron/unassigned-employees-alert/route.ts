import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push-notify";

export const dynamic = "force-dynamic";

/**
 * Cron quotidien (Karim 2026-05-13) — detecte les employes actifs sans
 * site_assignments actif et alerte admin/RH par notification persistante + push.
 *
 * Idempotent par jour : la notification kind='unassigned_alert' a un
 * data.day=YYYY-MM-DD ; on ne re-envoie pas si une notif du jour existe deja.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  // 1) Employes actifs
  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, status")
    .eq("status", "active");
  type EmpRow = { id: string; full_name: string; status: string };
  const allActive = (empsRaw ?? []) as EmpRow[];

  // 2) site_assignments actifs aujourd'hui
  const { data: assignsRaw } = await admin
    .from("site_assignments")
    .select("employee_id")
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const assignedIds = new Set(
    ((assignsRaw ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id),
  );
  const unassigned = allActive.filter((e) => !assignedIds.has(e.id));

  if (unassigned.length === 0) {
    return NextResponse.json({ ok: true, unassigned: 0, notified: 0 });
  }

  // 3) Destinataires : admin + rh actifs
  const { data: rhRaw } = await admin
    .from("profiles")
    .select("id, role")
    .in("role", ["admin", "rh"]);
  const rhIds = ((rhRaw ?? []) as Array<{ id: string; role: string }>).map((r) => r.id);
  if (rhIds.length === 0) {
    return NextResponse.json({ ok: true, unassigned: unassigned.length, notified: 0 });
  }

  // 4) Idempotence : check si une notif du jour deja envoyee a au moins un RH
  const { data: existingNotifs } = await admin
    .from("notifications")
    .select("recipient_id, data")
    .in("recipient_id", rhIds)
    .eq("kind", "unassigned_alert")
    .gte("created_at", `${todayISO}T00:00:00Z`);
  const alreadySentTo = new Set(
    ((existingNotifs ?? []) as Array<{ recipient_id: string }>).map((n) => n.recipient_id),
  );
  const toNotify = rhIds.filter((id) => !alreadySentTo.has(id));
  if (toNotify.length === 0) {
    return NextResponse.json({ ok: true, unassigned: unassigned.length, notified: 0, skipped: "already_sent_today" });
  }

  // 5) Cree notifications + envoie push
  const preview = unassigned.slice(0, 3).map((e) => e.full_name).join(", ");
  const more = unassigned.length > 3 ? ` (+${unassigned.length - 3})` : "";
  const inserts = toNotify.map((profileId) => ({
    recipient_id: profileId,
    kind: "unassigned_alert",
    title: `👥 ${unassigned.length} employé${unassigned.length > 1 ? "s" : ""} sans site affecté`,
    body: `${preview}${more} -- affecte-les depuis le dashboard admin pour combler les sites en déficit.`,
    link: "/admin",
    data: { day: todayISO, count: unassigned.length },
  }));
  await admin.from("notifications").insert(inserts);

  let pushResult = { sent: 0, failed: 0 };
  try {
    pushResult = await sendPushToProfiles(toNotify, {
      title: `${unassigned.length} employé${unassigned.length > 1 ? "s" : ""} sans site affecté`,
      body: `${preview}${more}. Affecte-les depuis le dashboard.`,
      link: "/admin",
    });
  } catch {
    /* noop : push echo deja gere dans le helper */
  }

  return NextResponse.json({
    ok: true,
    unassigned: unassigned.length,
    notified: inserts.length,
    push_sent: pushResult.sent,
    push_failed: pushResult.failed,
  });
}
