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
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
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
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
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
