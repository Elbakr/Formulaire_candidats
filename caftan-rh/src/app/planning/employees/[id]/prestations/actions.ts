"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

/**
 * Corrige inline l'heure d'un clock-out auto. Reservee admin/rh : on transforme
 * l'auto-OUT en OUT manuel (auto_clocked_out=false) et on trace la correction
 * dans `notes` pour audit. Karim 2026-05-24 : sortie depuis la page Prestations
 * (badge "AUTO-OUT (corrigible)" -> bouton Modifier).
 *
 * @param entryId        id du clock_entries (kind=out, auto_clocked_out=true)
 * @param newOccurredAt  ISO timestamp corrige (ex. "2026-05-24T18:30:00.000Z")
 * @param employeeId     id de l'employee (pour revalidatePath cible)
 */
export async function correctClockOutAction(
  entryId: string,
  newOccurredAt: string,
  employeeId: string,
): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);

  if (!entryId || typeof entryId !== "string") {
    return { error: "Entry invalide." };
  }
  const ts = new Date(newOccurredAt);
  if (Number.isNaN(ts.getTime())) {
    return { error: "Timestamp invalide." };
  }

  const supabase = await createClient();

  // Verifie que c'est bien un OUT auto (sinon on refuse pour ne pas ecraser
  // un OUT manuel par erreur).
  const { data: existing } = await supabase
    .from("clock_entries")
    .select("id, kind, auto_clocked_out, employee_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Entry introuvable." };
  const row = existing as {
    id: string;
    kind: "in" | "out";
    auto_clocked_out: boolean | null;
    employee_id: string;
  };
  if (row.kind !== "out") {
    return { error: "Cette correction n'est dispo que pour un OUT." };
  }

  const correctedAt = new Date().toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const author = profile.full_name ?? profile.role ?? "RH";
  const note = `OUT corrigé manuellement le ${correctedAt} par ${author}`;

  const { error } = await supabase
    .from("clock_entries")
    .update({
      occurred_at: ts.toISOString(),
      auto_clocked_out: false,
      entry_method: "manager_override",
      source: "manual_admin",
      notes: note,
    })
    .eq("id", entryId);

  if (error) return { error: error.message };

  // Revalidate la page Prestations de l'employee + la page Presence live.
  revalidatePath(`/planning/employees/${row.employee_id}/prestations`);
  if (employeeId && employeeId !== row.employee_id) {
    revalidatePath(`/planning/employees/${employeeId}/prestations`);
  }
  revalidatePath("/admin/presence");
  return { ok: true };
}

/**
 * Karim 2026-05-25 : edition complete d un clock_entries (kind + heure).
 * Permet de corriger les erreurs de doigt (employee a pointe IN au lieu d OUT
 * ou vice versa) et les heures erronees.
 */
export async function editClockEntryAction(
  entryId: string,
  newKind: "in" | "out",
  newOccurredAt: string,
): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!entryId) return { error: "Entry invalide." };
  if (newKind !== "in" && newKind !== "out") return { error: "Kind invalide." };
  const ts = new Date(newOccurredAt);
  if (Number.isNaN(ts.getTime())) return { error: "Timestamp invalide." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("clock_entries")
    .select("id, employee_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Entry introuvable." };
  const row = existing as { id: string; employee_id: string };

  const correctedAt = new Date().toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const author = profile.full_name ?? profile.role ?? "RH";
  const note = `Edition manuelle (kind=${newKind}) le ${correctedAt} par ${author}`;

  const { error } = await supabase
    .from("clock_entries")
    .update({
      kind: newKind,
      occurred_at: ts.toISOString(),
      entry_method: "manager_override",
      source: "manual_admin",
      auto_clocked_out: false,
      notes: note,
    })
    .eq("id", entryId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${row.employee_id}/prestations`);
  revalidatePath("/admin/presence");
  revalidatePath("/admin/heures-prestees");
  return { ok: true };
}

/**
 * Supprime un clock_entries (pour les fausses manips, doublons).
 */
export async function deleteClockEntryAction(
  entryId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!entryId) return { error: "Entry invalide." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("clock_entries")
    .select("id, employee_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Entry introuvable." };
  const row = existing as { id: string; employee_id: string };

  const { error } = await supabase.from("clock_entries").delete().eq("id", entryId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${row.employee_id}/prestations`);
  revalidatePath("/admin/presence");
  revalidatePath("/admin/heures-prestees");
  return { ok: true };
}

/**
 * Cree un clock_entries manuel (ex: employee a oublie de pointer, RH ajoute).
 */
export async function addClockEntryAction(args: {
  employeeId: string;
  kind: "in" | "out";
  occurredAt: string;
  siteId?: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee invalide." };
  if (args.kind !== "in" && args.kind !== "out") return { error: "Kind invalide." };
  const ts = new Date(args.occurredAt);
  if (Number.isNaN(ts.getTime())) return { error: "Timestamp invalide." };

  const supabase = await createClient();
  const correctedAt = new Date().toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const author = profile.full_name ?? profile.role ?? "RH";
  const note = `Ajout manuel le ${correctedAt} par ${author}`;

  const { error } = await supabase.from("clock_entries").insert({
    employee_id: args.employeeId,
    kind: args.kind,
    occurred_at: ts.toISOString(),
    site_id: args.siteId ?? null,
    entry_method: "manager_override",
    source: "manual_admin",
    auto_clocked_out: false,
    notes: note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${args.employeeId}/prestations`);
  revalidatePath("/admin/presence");
  revalidatePath("/admin/heures-prestees");
  return { ok: true };
}

/**
 * Karim 2026-06-02 : ajout d'un shift complet manuel (in + out en une seule
 * action) pour rattraper un Tuya sync raté ou un oubli employee. Logge dans
 * clock_entry_corrections pour audit.
 */
export async function addManualShiftAction(args: {
  employeeId: string;
  date: string;           // YYYY-MM-DD
  inTime: string;         // HH:MM
  outTime: string;        // HH:MM
  siteId?: string | null;
  reason?: string;        // justification (ex: "Tuya sync raté")
}): Promise<{ ok?: true; error?: string; entryIds?: { in: string; out: string } }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { error: "Date invalide (YYYY-MM-DD)." };
  if (!/^\d{2}:\d{2}$/.test(args.inTime) || !/^\d{2}:\d{2}$/.test(args.outTime)) return { error: "Format heure invalide (HH:MM)." };
  // Construction Date en local belge — pas d'offset embedded
  const inISO = new Date(`${args.date}T${args.inTime}:00`).toISOString();
  const outISO = new Date(`${args.date}T${args.outTime}:00`).toISOString();
  if (inISO >= outISO) return { error: "L'heure d'entrée doit être avant l'heure de sortie." };

  const supabase = await createClient();
  const author = profile.full_name ?? profile.role ?? "RH";
  const correctedAt = new Date().toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const note = `Shift ajouté manuellement le ${correctedAt} par ${author}${args.reason ? ` — ${args.reason}` : ""}`;

  // 1. Insert IN
  const { data: inEntry, error: inErr } = await supabase
    .from("clock_entries")
    .insert({
      employee_id: args.employeeId,
      kind: "in",
      occurred_at: inISO,
      site_id: args.siteId ?? null,
      entry_method: "manager_override",
      source: "manual_admin",
      auto_clocked_out: false,
      notes: note,
    })
    .select("id")
    .single();
  if (inErr || !inEntry) return { error: inErr?.message ?? "Insert IN KO" };

  // 2. Insert OUT
  const { data: outEntry, error: outErr } = await supabase
    .from("clock_entries")
    .insert({
      employee_id: args.employeeId,
      kind: "out",
      occurred_at: outISO,
      site_id: args.siteId ?? null,
      entry_method: "manager_override",
      source: "manual_admin",
      auto_clocked_out: false,
      notes: note,
    })
    .select("id")
    .single();
  if (outErr || !outEntry) return { error: outErr?.message ?? "Insert OUT KO" };

  // 3. Audit log (2 lignes : in + out)
  await supabase.from("clock_entry_corrections").insert([
    {
      employee_id: args.employeeId,
      clock_entry_id: inEntry.id,
      action: "create_manual",
      after_value: { kind: "in", occurred_at: inISO, site_id: args.siteId ?? null },
      actor_profile_id: profile.id,
      actor_name: author,
      reason: args.reason ?? null,
      target_date: args.date,
    },
    {
      employee_id: args.employeeId,
      clock_entry_id: outEntry.id,
      action: "create_manual",
      after_value: { kind: "out", occurred_at: outISO, site_id: args.siteId ?? null },
      actor_profile_id: profile.id,
      actor_name: author,
      reason: args.reason ?? null,
      target_date: args.date,
    },
  ]);

  revalidatePath(`/planning/employees/${args.employeeId}/prestations`);
  revalidatePath("/admin/presence");
  revalidatePath("/admin/heures-prestees");
  return { ok: true, entryIds: { in: inEntry.id, out: outEntry.id } };
}

/**
 * Karim 2026-06-02 : marque une date comme jour de repos explicite (pour
 * distinguer d'un trou de pointage non-corrigé). Crée une clock_entries
 * kind='rest_day' sans heure réelle.
 */
export async function markRestDayAction(args: {
  employeeId: string;
  date: string;     // YYYY-MM-DD
  reason?: string;
}): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { error: "Date invalide." };

  const supabase = await createClient();
  const author = profile.full_name ?? "RH";

  // Insert un marqueur. occurred_at = midi du jour pour ranking.
  const { data: entry, error } = await supabase
    .from("clock_entries")
    .insert({
      employee_id: args.employeeId,
      kind: "rest_day",
      occurred_at: new Date(`${args.date}T12:00:00`).toISOString(),
      site_id: null,
      entry_method: "manager_override",
      source: "manual_admin",
      auto_clocked_out: false,
      notes: `Jour de repos marqué par ${author}${args.reason ? ` — ${args.reason}` : ""}`,
    })
    .select("id")
    .single();
  if (error || !entry) return { error: error?.message ?? "Insert KO" };

  await supabase.from("clock_entry_corrections").insert({
    employee_id: args.employeeId,
    clock_entry_id: entry.id,
    action: "mark_rest_day",
    after_value: { date: args.date },
    actor_profile_id: profile.id,
    actor_name: author,
    reason: args.reason ?? null,
    target_date: args.date,
  });

  revalidatePath(`/planning/employees/${args.employeeId}/prestations`);
  revalidatePath("/admin/heures-prestees");
  return { ok: true };
}

/**
 * Karim 2026-06-02 : supprime un clock_entry AVEC audit log (raison
 * obligatoire). Distinct de deleteClockEntryAction historique qui delete
 * sans tracer.
 */
export async function deleteClockEntryWithAuditAction(args: {
  entryId: string;
  reason: string;
}): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.entryId || !args.reason) return { error: "Entry et raison requis." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("clock_entries")
    .select("id, employee_id, kind, occurred_at, site_id, source")
    .eq("id", args.entryId)
    .maybeSingle();
  if (!existing) return { error: "Entry introuvable." };
  const row = existing as { id: string; employee_id: string; kind: string; occurred_at: string; site_id: string | null; source: string | null };

  // Audit AVANT delete
  await supabase.from("clock_entry_corrections").insert({
    employee_id: row.employee_id,
    clock_entry_id: row.id,
    action: "delete",
    before_value: { kind: row.kind, occurred_at: row.occurred_at, site_id: row.site_id, source: row.source },
    actor_profile_id: profile.id,
    actor_name: profile.full_name ?? "RH",
    reason: args.reason,
    target_date: row.occurred_at.slice(0, 10),
  });

  const { error } = await supabase.from("clock_entries").delete().eq("id", args.entryId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${row.employee_id}/prestations`);
  revalidatePath("/admin/heures-prestees");
  return { ok: true };
}

/**
 * Liste l'historique des corrections pour un employee + plage date (cote UI).
 */
export async function getCorrectionsHistoryAction(args: {
  employeeId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<{ ok: boolean; corrections: Array<{ id: string; occurred_at: string; action: string; actor_name: string | null; reason: string | null; target_date: string | null; before_value: unknown; after_value: unknown }> }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  let q = supabase
    .from("clock_entry_corrections")
    .select("id, occurred_at, action, actor_name, reason, target_date, before_value, after_value")
    .eq("employee_id", args.employeeId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (args.fromDate) q = q.gte("target_date", args.fromDate);
  if (args.toDate) q = q.lte("target_date", args.toDate);
  const { data } = await q;
  return { ok: true, corrections: (data ?? []) as Array<{ id: string; occurred_at: string; action: string; actor_name: string | null; reason: string | null; target_date: string | null; before_value: unknown; after_value: unknown }> };
}
