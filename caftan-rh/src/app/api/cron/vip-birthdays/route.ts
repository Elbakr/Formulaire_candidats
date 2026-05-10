import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push-notify";

export const dynamic = "force-dynamic";

/**
 * Cron quotidien (09h Brussels) — détecte les anniversaires de clientes VIP
 * dont la date de naissance tombe aujourd'hui (matching mois-jour) et notifie
 * la vendeuse préférentielle :
 *   - notification persistante (table notifications)
 *   - DM dans une room kind='dm' où elle est membre (best-effort)
 *   - push si subscription active
 *
 * Inclut un message-suggestion à envoyer (FR/NL/AR de base).
 */

function suggestMessage(client: { full_name: string; language: string | null }) {
  const lang = (client.language ?? "fr").toLowerCase();
  const first = client.full_name.split(/\s+/)[0];
  if (lang === "nl") {
    return `Hallo ${first}! Hartelijk gefeliciteerd met uw verjaardag van het hele team. We hebben een speciale verrassing voor u — kom ons gauw bezoeken!`;
  }
  if (lang === "ar") {
    return `مرحبا ${first}! نتمنى لك عيد ميلاد سعيد من جميع الفريق. لدينا هدية خاصة لك — نحن في انتظار زيارتك!`;
  }
  if (lang === "en") {
    return `Hello ${first}! Happy birthday from all the team. We have a little surprise for you — come visit us soon!`;
  }
  return `Bonjour ${first} ! Toute l'équipe vous souhaite un très joyeux anniversaire. Une petite surprise vous attend chez nous — passez nous voir !`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayISO = today.toISOString().slice(0, 10);

  // Charge toutes les clientes actives avec une birth_date renseignée. On
  // filtre côté JS sur (mois,jour) car l'index PG est sur extract — on évite
  // un cast côté requête pour rester portable.
  const { data: clientsRaw } = await admin
    .from("vip_clients")
    .select(
      "id, full_name, phone, email, language, birth_date, preferred_seller_id, preferred_site_id",
    )
    .eq("is_active", true)
    .not("birth_date", "is", null);

  type C = {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    language: string | null;
    birth_date: string;
    preferred_seller_id: string | null;
    preferred_site_id: string | null;
  };
  const all = (clientsRaw ?? []) as C[];

  const todays = all.filter((c) => {
    const d = new Date(c.birth_date + "T00:00:00");
    return d.getMonth() + 1 === month && d.getDate() === day;
  });

  if (todays.length === 0) {
    return NextResponse.json({ ok: true, checked: all.length, birthdays_today: 0 });
  }

  // Map seller employee_id → profile_id pour notifier la vendeuse.
  const sellerEmpIds = Array.from(
    new Set(todays.map((c) => c.preferred_seller_id).filter(Boolean) as string[]),
  );
  let profileBySeller = new Map<string, string>();
  let nameByProfileId = new Map<string, string>();
  if (sellerEmpIds.length > 0) {
    const { data: emps } = await admin
      .from("employees")
      .select("id, profile_id, full_name")
      .in("id", sellerEmpIds);
    for (const e of (emps ?? []) as Array<{
      id: string;
      profile_id: string | null;
      full_name: string;
    }>) {
      if (e.profile_id) {
        profileBySeller.set(e.id, e.profile_id);
        nameByProfileId.set(e.profile_id, e.full_name);
      }
    }
  }

  // Aussi : charger admin/RH pour fallback si pas de vendeuse attribuée.
  let fallbackProfileIds: string[] = [];
  if (todays.some((c) => !c.preferred_seller_id)) {
    const { data: rh } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "rh"]);
    fallbackProfileIds = ((rh ?? []) as Array<{ id: string }>).map((p) => p.id);
  }

  const inserts: Array<{
    recipient_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
    data: Record<string, unknown>;
  }> = [];

  // Recipients par cliente — set unique pour éviter doublons.
  type Target = { profileId: string; client: C };
  const targets: Target[] = [];
  for (const c of todays) {
    const sellerProfileId = c.preferred_seller_id
      ? profileBySeller.get(c.preferred_seller_id)
      : null;
    if (sellerProfileId) {
      targets.push({ profileId: sellerProfileId, client: c });
    } else {
      // Fallback : tous les admin/RH
      for (const pid of fallbackProfileIds) {
        targets.push({ profileId: pid, client: c });
      }
    }
  }

  for (const t of targets) {
    const suggested = suggestMessage(t.client);
    inserts.push({
      recipient_id: t.profileId,
      kind: "vip_birthday",
      title: `🎂 Anniv. VIP — ${t.client.full_name}`,
      body: `Aujourd'hui, c'est l'anniversaire de ${t.client.full_name}. Suggestion : « ${suggested.slice(0, 100)}${suggested.length > 100 ? "…" : ""} »`,
      link: `/me/my-clients`,
      data: {
        client_id: t.client.id,
        client_name: t.client.full_name,
        suggested_message: suggested,
        phone: t.client.phone,
        email: t.client.email,
      },
    });
  }

  if (inserts.length > 0) {
    await admin.from("notifications").insert(inserts);
  }

  // DM dans la room kind='dm' du destinataire (best-effort).
  const uniqueProfiles = Array.from(new Set(targets.map((t) => t.profileId)));
  for (const pid of uniqueProfiles) {
    const { data: rooms } = await admin
      .from("chat_room_members")
      .select("room_id, room:chat_rooms(id, kind)")
      .eq("profile_id", pid);
    type Room = { room_id: string; room: { id: string; kind: string } | null };
    const dmRoom = ((rooms ?? []) as unknown as Room[]).find(
      (r) => r.room?.kind === "dm",
    );
    if (!dmRoom) continue;
    const targetsForProfile = targets.filter((t) => t.profileId === pid);
    for (const t of targetsForProfile) {
      const suggested = suggestMessage(t.client);
      const body =
        `🎂 **Anniversaire VIP** : c'est l'anniversaire de **${t.client.full_name}** aujourd'hui.\n\n` +
        `Message proposé :\n> ${suggested}\n\n` +
        `${t.client.phone ? `Tél. : ${t.client.phone}\n` : ""}` +
        `${t.client.email ? `Email : ${t.client.email}\n` : ""}` +
        `Action : /me/my-clients`;
      await admin.from("chat_messages").insert({
        room_id: dmRoom.room_id,
        author_profile_id: pid,
        body,
        attachments: [
          {
            kind: "vip_birthday",
            client_id: t.client.id,
            suggested_message: suggested,
          },
        ],
      });
    }
  }

  // Push best-effort.
  let push = { sent: 0, failed: 0 };
  try {
    push = await sendPushToProfiles(uniqueProfiles, {
      title: "🎂 Anniversaire VIP",
      body:
        todays.length === 1
          ? `${todays[0].full_name} fête son anniversaire aujourd'hui.`
          : `${todays.length} clientes VIP fêtent leur anniversaire aujourd'hui.`,
      link: "/me/my-clients",
      priority: "normal",
      tag: `vip-birthday-${todayISO}`,
    });
  } catch {
    /* déjà loggué dans le helper */
  }

  return NextResponse.json({
    ok: true,
    checked: all.length,
    birthdays_today: todays.length,
    notifications_created: inserts.length,
    push_sent: push.sent,
    push_failed: push.failed,
  });
}
