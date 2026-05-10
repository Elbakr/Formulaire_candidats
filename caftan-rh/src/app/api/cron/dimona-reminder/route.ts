import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push-notify";

export const dynamic = "force-dynamic";

/**
 * Cron quotidien — détecte les employés qui démarrent aujourd'hui ou demain
 * sans Dimona déclarée et alerte admin/RH par notification persistante,
 * message DM, et push si subscription active.
 *
 * Appel par Vercel Cron : GET avec header `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const tomorrowISO = new Date(today.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Employés actifs avec start_date dans [today, tomorrow]
  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, start_date, status")
    .eq("status", "active")
    .gte("start_date", todayISO)
    .lte("start_date", tomorrowISO);
  type EmpRow = {
    id: string;
    full_name: string;
    start_date: string;
    status: string;
  };
  const emps = (empsRaw ?? []) as EmpRow[];

  if (emps.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      missing: 0,
      notified_profiles: 0,
    });
  }

  // Pour chaque employé, vérifie qu'une dimona n'est pas déjà déclarée pour cette start_date.
  const empIds = emps.map((e) => e.id);
  const { data: dimonasRaw } = await admin
    .from("dimona_declarations")
    .select("employee_id, start_date, status")
    .in("employee_id", empIds)
    .in("status", ["declared_onss", "confirmed"]);
  const declaredKey = new Set(
    ((dimonasRaw ?? []) as Array<{
      employee_id: string;
      start_date: string;
    }>).map((d) => `${d.employee_id}::${d.start_date}`),
  );

  const missing = emps.filter(
    (e) => !declaredKey.has(`${e.id}::${e.start_date}`),
  );

  if (missing.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: emps.length,
      missing: 0,
      notified_profiles: 0,
    });
  }

  // Récupère les admin/RH
  const { data: rhRows } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("role", ["admin", "rh"]);
  type Rh = { id: string; email: string; full_name: string | null };
  const rhProfiles = (rhRows ?? []) as Rh[];
  const rhIds = rhProfiles.map((p) => p.id);

  if (rhIds.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: emps.length,
      missing: missing.length,
      notified_profiles: 0,
      warning: "no_admin_rh_profiles",
    });
  }

  // Notifications persistantes (1 par admin × employé manquant)
  const inserts: Array<{
    recipient_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
    data: Record<string, unknown>;
  }> = [];

  // Site primaire pour message contextuel
  const { data: assignsRaw } = await admin
    .from("site_assignments")
    .select("employee_id, site_id, is_primary, end_date, site:sites(code, name)")
    .in("employee_id", missing.map((e) => e.id))
    .is("end_date", null);
  type AssignRow = {
    employee_id: string;
    is_primary: boolean;
    end_date: string | null;
    site: { code: string; name: string } | null;
  };
  const siteByEmp = new Map<string, { code: string; name: string }>();
  for (const a of (assignsRaw ?? []) as unknown as AssignRow[]) {
    if (a.is_primary && a.site && !siteByEmp.has(a.employee_id)) {
      siteByEmp.set(a.employee_id, a.site);
    } else if (a.site && !siteByEmp.has(a.employee_id)) {
      siteByEmp.set(a.employee_id, a.site);
    }
  }

  for (const e of missing) {
    const startFr = new Date(e.start_date + "T00:00:00").toLocaleDateString(
      "fr-BE",
      { weekday: "long", day: "2-digit", month: "long" },
    );
    const site = siteByEmp.get(e.id);
    const siteSuffix = site ? ` au site ${site.code}` : "";
    const bodyShort = `${e.full_name} démarre le ${startFr}${siteSuffix}. Pas encore déclarée.`;
    const link = `/planning/employees/${e.id}/dimona`;

    for (const r of rhProfiles) {
      inserts.push({
        recipient_id: r.id,
        kind: "dimona_urgent",
        title: `🚨 Dimona urgent — ${e.full_name}`,
        body: bodyShort,
        link,
        data: { employee_id: e.id, start_date: e.start_date },
      });
    }
  }

  if (inserts.length > 0) {
    await admin.from("notifications").insert(inserts);
  }

  // DM à chaque admin/RH avec message texte explicite (loop conversationnelle).
  for (const r of rhProfiles) {
    // Trouve / crée une room "self DM" : ici on poste plutôt dans un room
    // dédié si elle existe, sinon on saute (on a déjà la notif persistante).
    // V1 : on cherche une room kind='dm' dont l'utilisateur est seul membre,
    // sinon on insère le message dans la première DM dispo (best effort).
    const { data: rooms } = await admin
      .from("chat_room_members")
      .select("room_id, room:chat_rooms(id, kind)")
      .eq("profile_id", r.id);
    type Room = {
      room_id: string;
      room: { id: string; kind: string } | null;
    };
    const dmRoom = ((rooms ?? []) as unknown as Room[]).find(
      (rm) => rm.room?.kind === "dm",
    );
    if (!dmRoom) continue;

    for (const e of missing) {
      const startFr = new Date(e.start_date + "T00:00:00").toLocaleDateString(
        "fr-BE",
        { weekday: "long", day: "2-digit", month: "long" },
      );
      const site = siteByEmp.get(e.id);
      const link = `/planning/employees/${e.id}/dimona`;
      const body =
        `🚨 **Dimona à déclarer** : ${e.full_name} commence le ${startFr}` +
        `${site ? ` au site ${site.code}` : ""}. ` +
        `Si pas déclarée AVANT 8h le jour J, l'ONSS peut amender. ` +
        `Action : ${link}`;
      await admin.from("chat_messages").insert({
        room_id: dmRoom.room_id,
        author_profile_id: r.id,
        body,
        attachments: [
          {
            kind: "dimona_reminder",
            employee_id: e.id,
            start_date: e.start_date,
          },
        ],
      });
    }
  }

  // Push (best effort — ne bloque pas si VAPID non configurée).
  let push = { sent: 0, failed: 0 };
  try {
    const titles = missing.map((e) => e.full_name).join(", ");
    push = await sendPushToProfiles(rhIds, {
      title: "🚨 Dimona urgent",
      body: `À déclarer : ${titles}`,
      link: "/today",
      priority: "urgent",
      tag: `dimona-${todayISO}`,
    });
  } catch {
    /* déjà loggué dans le helper */
  }

  return NextResponse.json({
    ok: true,
    checked: emps.length,
    missing: missing.length,
    notifications_created: inserts.length,
    push_sent: push.sent,
    push_failed: push.failed,
  });
}
