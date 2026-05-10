"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole, requireProfile } from "@/lib/auth";
import { haversineKm, lookupCoords, loadSiteCoords } from "@/lib/distance";
import { shiftHours } from "@/lib/planning";
import { sendPushToProfile } from "@/lib/push-notify";

// --- types --------------------------------------------------------------

export type ReinforcementCandidate = {
  employee_id: string;
  employee_name: string;
  job_title: string | null;
  weekly_hours: number;
  used_hours_week: number;
  remaining_hours: number;
  distance_km: number | null;
  tier: 1 | 2 | 3;        // 1 primary site, 2 secondary site, 3 external
  has_conflict: boolean;
  reason_blocked: string | null;
};

export type ReinforcementRequestRow = {
  id: string;
  site_id: string;
  site_code: string;
  site_name: string;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
  notes: string | null;
  status: string;
  proposed_employee_id: string | null;
  proposed_employee_name: string | null;
  proposed_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
};

// --- helpers ------------------------------------------------------------

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return timeToMin(aS) < timeToMin(bE) && timeToMin(aE) > timeToMin(bS);
}

function startOfWeekISO(dateISO: string): { mondayISO: string; sundayISO: string } {
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    mondayISO: mon.toISOString().slice(0, 10),
    sundayISO: sun.toISOString().slice(0, 10),
  };
}

// --- create request -----------------------------------------------------

export async function createReinforcementRequestAction(args: {
  siteId: string;
  date: string;
  startTime: string;
  endTime: string;
  position?: string | null;
  notes?: string | null;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { siteId, date, startTime, endTime, position, notes } = args;
  if (!siteId || !date || !startTime || !endTime) {
    return { error: "Champs manquants." };
  }
  if (timeToMin(endTime) <= timeToMin(startTime)) {
    return { error: "L'heure de fin doit être > heure de début." };
  }
  const { data, error } = await supabase
    .from("reinforcement_requests")
    .insert({
      requester_profile_id: profile.id,
      site_id: siteId,
      date,
      start_time: startTime,
      end_time: endTime,
      position: position ?? null,
      notes: notes ?? null,
      status: "open",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/reinforcement");
  return { ok: true, id: (data as { id: string }).id };
}

// --- list candidates for a request --------------------------------------

export async function listReinforcementCandidatesAction(
  requestId: string,
): Promise<{ candidates?: ReinforcementCandidate[]; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select("id, site_id, date, start_time, end_time")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as {
    id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
  };

  // Coords du site cible
  const sites = await loadSiteCoords();
  const targetSite = sites.find((s) => s.id === r.site_id);
  if (!targetSite) return { error: "Site introuvable." };

  // Tous les employés actifs avec adresse pour le tri distance
  const { data: empsRaw } = await supabase
    .from("employees")
    .select(
      "id, full_name, job_title, status, weekly_hours, postal_code, city",
    )
    .eq("status", "active");
  type EmpRow = {
    id: string;
    full_name: string;
    job_title: string | null;
    status: string;
    weekly_hours: number | null;
    postal_code: string | null;
    city: string | null;
  };
  const emps = (empsRaw ?? []) as EmpRow[];

  // Affectations site (pour calculer le tier)
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("employee_id, site_id, is_primary")
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const assigns = (assignsRaw ?? []) as Array<{
    employee_id: string;
    site_id: string;
    is_primary: boolean;
  }>;
  const tierByEmp = new Map<string, 1 | 2 | 3>();
  for (const a of assigns) {
    if (a.site_id !== r.site_id) continue;
    tierByEmp.set(a.employee_id, a.is_primary ? 1 : 2);
  }

  // Heures déjà planifiées cette semaine (pour le calcul des heures restantes)
  const { mondayISO, sundayISO } = startOfWeekISO(r.date);
  const { data: shiftsRaw } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes")
    .gte("date", mondayISO)
    .lte("date", sundayISO);
  type ShiftRow = {
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
  };
  const shifts = (shiftsRaw ?? []) as ShiftRow[];
  const usedByEmp = new Map<string, number>();
  for (const s of shifts) {
    usedByEmp.set(
      s.employee_id,
      (usedByEmp.get(s.employee_id) ?? 0) +
        shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
    );
  }

  // Indispos / congés / time-off pour exclure les employés bloqués
  const { data: offsRaw } = await supabase
    .from("time_off_requests")
    .select("employee_id, start_date, end_date")
    .eq("status", "approved")
    .lte("start_date", r.date)
    .gte("end_date", r.date);
  const offs = (offsRaw ?? []) as Array<{
    employee_id: string;
    start_date: string;
    end_date: string;
  }>;
  const offSet = new Set(offs.map((o) => o.employee_id));

  const dow = new Date(r.date + "T00:00:00").getDay();
  const { data: unavailRaw } = await supabase
    .from("employee_unavailabilities")
    .select("employee_id, day_of_week, date_specific, start_time, end_time, is_active")
    .eq("is_active", true);
  type UnavailRow = {
    employee_id: string;
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
  };
  const unavail = (unavailRaw ?? []) as UnavailRow[];

  const result: ReinforcementCandidate[] = [];
  for (const e of emps) {
    const tier = (tierByEmp.get(e.id) ?? 3) as 1 | 2 | 3;
    const used = usedByEmp.get(e.id) ?? 0;
    const cap = e.weekly_hours ?? 38;

    // Distance
    let distanceKm: number | null = null;
    if (e.postal_code || e.city) {
      const c = await lookupCoords(e.postal_code, e.city);
      if (c) distanceKm = haversineKm(c, { lat: targetSite.lat, lng: targetSite.lng });
    }

    // Conflits / blocages
    let blocked: string | null = null;
    if (offSet.has(e.id)) blocked = "Congé approuvé";
    if (!blocked) {
      const conflict = shifts.some(
        (s) =>
          s.employee_id === e.id &&
          s.date === r.date &&
          overlaps(s.start_time, s.end_time, r.start_time, r.end_time),
      );
      if (conflict) blocked = "Shift en conflit";
    }
    if (!blocked) {
      const unav = unavail.some((u) => {
        if (u.employee_id !== e.id) return false;
        const matchDay = u.day_of_week === dow || u.date_specific === r.date;
        if (!matchDay) return false;
        if (!u.start_time || !u.end_time) return true;
        return overlaps(u.start_time, u.end_time, r.start_time, r.end_time);
      });
      if (unav) blocked = "Indisponibilité déclarée";
    }

    result.push({
      employee_id: e.id,
      employee_name: e.full_name,
      job_title: e.job_title,
      weekly_hours: cap,
      used_hours_week: used,
      remaining_hours: Math.max(0, cap - used),
      distance_km: distanceKm,
      tier,
      has_conflict: !!blocked,
      reason_blocked: blocked,
    });
  }

  // Tri spec : distance asc → heures restantes desc → tier asc.
  result.sort((a, b) => {
    if (a.has_conflict !== b.has_conflict) return a.has_conflict ? 1 : -1;
    const da = a.distance_km ?? 9999;
    const db = b.distance_km ?? 9999;
    if (Math.abs(da - db) > 0.01) return da - db;
    if (a.remaining_hours !== b.remaining_hours)
      return b.remaining_hours - a.remaining_hours;
    return a.tier - b.tier;
  });

  return { candidates: result };
}

// --- propose / accept / decline -----------------------------------------

async function ensureDmRoom(
  managerProfileId: string,
  employeeProfileId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  // Try to find a DM room where both are members.
  const { data: existing } = await admin
    .from("chat_rooms")
    .select("id, members:chat_room_members(profile_id)")
    .eq("kind", "dm");
  type Row = { id: string; members: { profile_id: string }[] };
  const rooms = (existing ?? []) as Row[];
  for (const r of rooms) {
    const ids = new Set(r.members.map((m) => m.profile_id));
    if (
      ids.size === 2 &&
      ids.has(managerProfileId) &&
      ids.has(employeeProfileId)
    ) {
      return r.id;
    }
  }
  // Create one
  const { data: created, error } = await admin
    .from("chat_rooms")
    .insert({
      kind: "dm",
      name: "DM",
      created_by: managerProfileId,
    })
    .select("id")
    .single();
  if (error || !created) return null;
  const roomId = (created as { id: string }).id;
  await admin
    .from("chat_room_members")
    .upsert(
      [
        { room_id: roomId, profile_id: managerProfileId, role: "admin" },
        { room_id: roomId, profile_id: employeeProfileId, role: "member" },
      ],
      { onConflict: "room_id,profile_id", ignoreDuplicates: true },
    );
  return roomId;
}

export async function proposeReinforcementAction(args: {
  requestId: string;
  employeeId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { requestId, employeeId } = args;

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select(
      `id, site_id, date, start_time, end_time, position, status,
       site:sites(code, name)`,
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as unknown as {
    id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    status: string;
    site: { code: string; name: string } | null;
  };
  if (!["open", "declined", "expired"].includes(r.status)) {
    return { error: `Demande pas dans un état proposable (${r.status}).` };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("id, profile_id, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp || !(emp as { profile_id: string | null }).profile_id) {
    return { error: "Employé sans profil utilisateur — proposition impossible." };
  }
  const employeeProfileId = (emp as { profile_id: string }).profile_id;
  const employeeName = (emp as { full_name: string }).full_name;

  const expiresAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  const { error: upErr } = await supabase
    .from("reinforcement_requests")
    .update({
      proposed_employee_id: employeeId,
      status: "sent_to_employee",
      proposed_at: new Date().toISOString(),
      responded_at: null,
      expires_at: expiresAt,
    })
    .eq("id", requestId);
  if (upErr) return { error: upErr.message };

  // DM message via admin client (RLS bypass) — author = manager.
  const roomId = await ensureDmRoom(profile.id, employeeProfileId);
  const dateFr = new Date(r.date + "T00:00:00").toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const link = `/me/reinforcement/${requestId}`;
  const body =
    `Renfort proposé : ${r.site?.name ?? "Site"} le ${dateFr} ` +
    `de ${r.start_time.slice(0, 5)} à ${r.end_time.slice(0, 5)}` +
    `${r.position ? ` (${r.position})` : ""}.\n` +
    `Réponds OUI / NON ici, ou ouvre : ${link}`;
  if (roomId) {
    await admin.from("chat_messages").insert({
      room_id: roomId,
      author_profile_id: profile.id,
      body,
      attachments: [
        {
          kind: "reinforcement_proposal",
          request_id: requestId,
          site_name: r.site?.name ?? null,
          site_code: r.site?.code ?? null,
          date: r.date,
          start_time: r.start_time.slice(0, 5),
          end_time: r.end_time.slice(0, 5),
          position: r.position ?? null,
          expires_at: expiresAt,
        },
      ],
    });
  }

  // Notification persistante
  await admin.from("notifications").insert({
    recipient_id: employeeProfileId,
    kind: "reinforcement_proposed",
    title: "Renfort proposé",
    body: `${r.site?.name ?? "Site"} — ${dateFr} ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`,
    link,
    data: { request_id: requestId, expires_at: expiresAt },
  });

  // Push (silencieux si VAPID non configuré).
  await sendPushToProfile(employeeProfileId, {
    title: "Renfort proposé",
    body: `${r.site?.name ?? "Site"} — ${dateFr} ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}. Réponds OUI/NON.`,
    link,
    priority: "urgent",
    tag: `reinforcement-${requestId}`,
  });

  revalidatePath("/planning/reinforcement");
  return { ok: true };
}

export async function acceptReinforcementAction(
  requestId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as {
    id: string;
    site_id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    status: string;
    proposed_employee_id: string | null;
    requester_profile_id: string | null;
  };
  if (r.status !== "sent_to_employee") {
    return { error: `Cette demande n'est plus active (${r.status}).` };
  }

  // Check that current user matches proposed employee
  const { data: emp } = await supabase
    .from("employees")
    .select("id, profile_id, full_name, default_pause_minutes")
    .eq("id", r.proposed_employee_id ?? "")
    .maybeSingle();
  if (!emp || (emp as { profile_id: string | null }).profile_id !== user.id) {
    return { error: "Cette proposition ne t'est pas adressée." };
  }
  const empRow = emp as {
    id: string;
    profile_id: string;
    full_name: string;
    default_pause_minutes: number | null;
  };

  // Conflict check
  const { data: conflictsRaw } = await supabase
    .from("shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", empRow.id)
    .eq("date", r.date);
  type ShiftLite = { id: string; start_time: string; end_time: string };
  const conflicts = (conflictsRaw ?? []) as ShiftLite[];
  const conflict = conflicts.some((s) =>
    overlaps(s.start_time, s.end_time, r.start_time, r.end_time),
  );
  if (conflict) {
    return { error: "Tu as déjà un shift en conflit ce jour-là." };
  }

  const { data: timeOffRaw } = await supabase
    .from("time_off_requests")
    .select("id")
    .eq("employee_id", empRow.id)
    .eq("status", "approved")
    .lte("start_date", r.date)
    .gte("end_date", r.date)
    .limit(1);
  if ((timeOffRaw ?? []).length > 0) {
    return { error: "Tu es en congé approuvé ce jour-là." };
  }

  // Crée le shift via admin (l'employé n'a pas les droits insert sur shifts).
  const { data: shiftIns, error: insErr } = await admin
    .from("shifts")
    .insert({
      employee_id: empRow.id,
      site_id: r.site_id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      break_minutes: empRow.default_pause_minutes ?? 30,
      position: r.position,
      status: "planned",
      created_by: profile.id,
      notes: "Renfort accepté",
    })
    .select("id")
    .single();
  if (insErr || !shiftIns) {
    return { error: insErr?.message ?? "Insertion shift échouée." };
  }
  const shiftId = (shiftIns as { id: string }).id;

  await admin
    .from("reinforcement_requests")
    .update({
      status: "covered",
      responded_at: new Date().toISOString(),
      resulting_shift_id: shiftId,
    })
    .eq("id", r.id);

  if (r.requester_profile_id) {
    await admin.from("notifications").insert({
      recipient_id: r.requester_profile_id,
      kind: "reinforcement_accepted",
      title: "Renfort accepté",
      body: `${empRow.full_name} a accepté la demande de renfort.`,
      link: `/planning/reinforcement`,
      data: { request_id: r.id, shift_id: shiftId },
    });
    // Message de confirmation dans la DM (boucle conversation)
    const roomId = await ensureDmRoom(profile.id, r.requester_profile_id);
    if (roomId) {
      await admin.from("chat_messages").insert({
        room_id: roomId,
        author_profile_id: profile.id,
        body: `✅ ${empRow.full_name} a accepté le renfort. Shift créé.`,
        attachments: [
          { kind: "reinforcement_reply", request_id: r.id, decision: "accepted" },
        ],
      });
    }
  }
  revalidatePath("/planning/reinforcement");
  revalidatePath("/chat", "layout");
  revalidatePath(`/me/reinforcement/${r.id}`);
  return { ok: true };
}

export async function declineReinforcementAction(
  requestId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as {
    id: string;
    status: string;
    proposed_employee_id: string | null;
    requester_profile_id: string | null;
  };
  if (r.status !== "sent_to_employee") {
    return { error: `Cette demande n'est plus active (${r.status}).` };
  }
  // Vérifie que c'est bien l'employé proposé.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, profile_id, full_name")
    .eq("id", r.proposed_employee_id ?? "")
    .maybeSingle();
  if (!emp || (emp as { profile_id: string | null }).profile_id !== user.id) {
    return { error: "Cette proposition ne t'est pas adressée." };
  }
  const empName = (emp as { full_name: string }).full_name;

  await admin
    .from("reinforcement_requests")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", r.id);

  if (r.requester_profile_id) {
    await admin.from("notifications").insert({
      recipient_id: r.requester_profile_id,
      kind: "reinforcement_declined",
      title: "Renfort décliné",
      body: `${empName} a décliné. Tu peux proposer à un autre employé.`,
      link: `/planning/reinforcement`,
      data: { request_id: r.id },
    });
    // Message de confirmation dans la DM (boucle conversation)
    const empProfileId = (emp as { profile_id: string | null }).profile_id;
    if (empProfileId) {
      const roomId = await ensureDmRoom(empProfileId, r.requester_profile_id);
      if (roomId) {
        await admin.from("chat_messages").insert({
          room_id: roomId,
          author_profile_id: empProfileId,
          body: `❌ ${empName} a décliné le renfort.`,
          attachments: [
            { kind: "reinforcement_reply", request_id: r.id, decision: "declined" },
          ],
        });
      }
    }
  }
  revalidatePath("/planning/reinforcement");
  revalidatePath("/chat", "layout");
  revalidatePath(`/me/reinforcement/${r.id}`);
  return { ok: true };
}

export async function cancelReinforcementAction(
  requestId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("reinforcement_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);
  if (error) return { error: error.message };
  revalidatePath("/planning/reinforcement");
  return { ok: true };
}
