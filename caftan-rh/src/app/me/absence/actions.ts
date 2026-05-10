"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { sendPushToProfiles } from "@/lib/push-notify";

const REASON_LABELS: Record<string, string> = {
  sick: "Maladie",
  family_emergency: "Urgence familiale",
  transport: "Transport",
  other: "Autre",
};

async function getMyEmployee(): Promise<
  | { id: string; full_name: string; profile_id: string }
  | { error: string }
> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, profile_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const e = data as
    | { id: string; full_name: string; profile_id: string }
    | null;
  if (!e?.id) return { error: "Tu n'es pas enregistré comme employé actif." };
  return e;
}

export async function reportAbsenceAction(input: {
  date: string;
  reason: string;
  justificationUrl?: string;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string; absenceId?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  if (!input.date) return { error: "Date requise." };
  if (!input.reason) return { error: "Raison requise." };
  if (!REASON_LABELS[input.reason]) {
    return { error: "Raison invalide." };
  }

  // Trouve le shift planifié de l'employé pour cette date.
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, date, start_time, end_time, site_id, site:sites(code, name)")
    .eq("employee_id", me.id)
    .eq("date", input.date)
    .order("start_time", { ascending: true });
  const shiftRows = (shifts ?? []) as unknown as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    site_id: string | null;
    site: { code: string; name: string } | null;
  }>;
  // V1 : on prend le 1er shift de la journée comme shift de référence.
  const primaryShift = shiftRows[0] ?? null;

  const { data: ins, error } = await supabase
    .from("unplanned_absences")
    .insert({
      employee_id: me.id,
      shift_id: primaryShift?.id ?? null,
      date: input.date,
      reason: input.reason,
      justification_url: input.justificationUrl?.trim()
        ? input.justificationUrl.trim()
        : null,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select("id")
    .single();
  if (error || !ins) return { error: error?.message ?? "Insertion échouée." };
  const absenceId = (ins as { id: string }).id;

  // Déclenche la procédure de remplacement : poste un message dans le
  // chat du site_group concerné.
  if (primaryShift?.site_id) {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", primaryShift.site_id)
      .maybeSingle();
    const roomId = (room as { id: string } | null)?.id ?? null;

    if (roomId) {
      const reasonLabel = REASON_LABELS[input.reason];
      const messageBody =
        `🚨 Absence imprévue — ${me.full_name} est absent(e) le ${input.date} ` +
        `de ${primaryShift.start_time.slice(0, 5)} à ${primaryShift.end_time.slice(0, 5)} ` +
        `sur Site ${primaryShift.site?.code ?? "?"}. ` +
        `Raison : ${reasonLabel}. Qui peut couvrir ? Réagissez ici.`;

      const { data: msg } = await supabase
        .from("chat_messages")
        .insert({
          room_id: roomId,
          author_profile_id: me.profile_id,
          body: messageBody,
          attachments: [
            {
              kind: "absence_call",
              absence_id: absenceId,
              shift_id: primaryShift.id,
              site_code: primaryShift.site?.code ?? null,
            },
          ],
        })
        .select("id")
        .single();

      if (msg) {
        await supabase
          .from("unplanned_absences")
          .update({ chat_message_id: (msg as { id: string }).id })
          .eq("id", absenceId);
      }
    }
  }

  // Notif RH (best effort).
  const adminProfileIds: string[] = [];
  try {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "rh"]);
    const recipients = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
    adminProfileIds.push(...recipients);
    for (const rid of recipients) {
      await supabase.from("notifications").insert({
        recipient_id: rid,
        kind: "unplanned_absence",
        title: "Absence imprévue signalée",
        body: `${me.full_name} a signalé une absence le ${input.date} (${REASON_LABELS[input.reason]}).`,
        link: "/admin/absences",
        data: { absence_id: absenceId },
      });
    }
  } catch {
    // optionnel
  }

  // Push : RH/admin + collègues du site_group qui ont accepté les notifs.
  try {
    const targetProfileIds = new Set<string>(adminProfileIds);
    if (primaryShift?.site_id) {
      const { data: collegues } = await supabase
        .from("site_assignments")
        .select("employee:employees(profile_id)")
        .eq("site_id", primaryShift.site_id)
        .is("end_date", null);
      type Coll = { employee: { profile_id: string | null } | null };
      for (const r of (collegues ?? []) as unknown as Coll[]) {
        const pid = r.employee?.profile_id;
        if (pid && pid !== me.profile_id) targetProfileIds.add(pid);
      }
    }
    if (targetProfileIds.size > 0) {
      await sendPushToProfiles([...targetProfileIds], {
        title: "🚨 Absence imprévue",
        body: `${me.full_name} absent(e) le ${input.date}${primaryShift?.site?.code ? ` — site ${primaryShift.site.code}` : ""}. Qui peut couvrir ?`,
        link: "/me/absence",
        priority: "urgent",
        tag: `absence-${absenceId}`,
      });
    }
  } catch {
    /* push best-effort */
  }

  revalidatePath("/me/absence");
  revalidatePath("/admin/absences");
  return { ok: true, absenceId };
}

/**
 * V1 : un collègue se déclare volontaire pour couvrir une absence.
 * - Vérifie qu'il n'est pas déjà sur un shift conflictuel.
 * - Pas en congé approuvé.
 * - Transfère le shift (shifts.employee_id ← volunteerId).
 */
export async function volunteerForAbsenceAction(
  absenceId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  const { data: absRaw } = await supabase
    .from("unplanned_absences")
    .select("id, employee_id, shift_id, date, status")
    .eq("id", absenceId)
    .maybeSingle();
  const abs = absRaw as
    | {
        id: string;
        employee_id: string;
        shift_id: string | null;
        date: string;
        status: string;
      }
    | null;
  if (!abs) return { error: "Absence introuvable." };
  if (abs.employee_id === me.id) {
    return { error: "Tu ne peux pas couvrir ta propre absence." };
  }
  if (abs.status === "covered" || abs.status === "resolved") {
    return { error: "Cette absence est déjà couverte." };
  }
  if (!abs.shift_id) {
    return { error: "Aucun shift à couvrir n'est rattaché à cette absence." };
  }

  // Charge le shift.
  const { data: sh } = await supabase
    .from("shifts")
    .select("id, date, start_time, end_time, site_id, site:sites(code)")
    .eq("id", abs.shift_id)
    .maybeSingle();
  const shift = sh as
    | {
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        site_id: string | null;
        site: { code: string } | null;
      }
    | null;
  if (!shift) return { error: "Shift à couvrir introuvable." };

  // Conflit horaire : a-t-il déjà un shift ce jour qui chevauche ?
  const { data: myShifts } = await supabase
    .from("shifts")
    .select("id, date, start_time, end_time")
    .eq("employee_id", me.id)
    .eq("date", shift.date);
  function toMin(t: string): number {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  }
  const conflict = ((myShifts ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
  }>).some(
    (s) =>
      toMin(s.start_time) < toMin(shift.end_time) &&
      toMin(s.end_time) > toMin(shift.start_time),
  );
  if (conflict) {
    return { error: "Tu as déjà un shift sur ce créneau — impossible." };
  }

  // Pas en congé approuvé sur la date.
  const { data: leaves } = await supabase
    .from("time_off_requests")
    .select("id, start_date, end_date, status")
    .eq("employee_id", me.id)
    .eq("status", "approved")
    .lte("start_date", shift.date)
    .gte("end_date", shift.date);
  if (((leaves ?? []) as Array<{ id: string }>).length > 0) {
    return { error: "Tu es en congé approuvé sur cette date." };
  }

  // Transfère le shift.
  const { error: errA } = await supabase
    .from("shifts")
    .update({ employee_id: me.id })
    .eq("id", shift.id);
  if (errA) return { error: errA.message };

  // Marque l'absence comme couverte.
  await supabase
    .from("unplanned_absences")
    .update({
      status: "covered",
      replacement_employee_id: me.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", absenceId);

  // Poste un message de confirmation dans le chat du site_group.
  if (shift.site_id) {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", shift.site_id)
      .maybeSingle();
    const roomId = (room as { id: string } | null)?.id ?? null;
    if (roomId) {
      await supabase.from("chat_messages").insert({
        room_id: roomId,
        author_profile_id: me.profile_id,
        body: `✅ ${me.full_name} couvre l'absence (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)} site ${shift.site?.code ?? "?"}).`,
        attachments: [
          {
            kind: "absence_covered",
            absence_id: absenceId,
            shift_id: shift.id,
          },
        ],
      });
    }
  }

  revalidatePath("/me/absence");
  revalidatePath("/admin/absences");
  revalidatePath("/me/planning");
  revalidatePath("/planning/calendar");
  return { ok: true };
}

export async function adminMarkAbsenceResolvedAction(
  absenceId: string,
  notes?: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("unplanned_absences")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      notes: notes?.trim() ? notes.trim() : null,
    })
    .eq("id", absenceId);
  if (error) return { error: error.message };
  revalidatePath("/admin/absences");
  return { ok: true };
}

export async function adminMarkAbsenceUnfilledAction(
  absenceId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("unplanned_absences")
    .update({ status: "unfilled" })
    .eq("id", absenceId);
  if (error) return { error: error.message };
  revalidatePath("/admin/absences");
  return { ok: true };
}
