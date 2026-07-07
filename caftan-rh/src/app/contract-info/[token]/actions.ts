"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { isoMinusYears } from "@/lib/be-validators";

// Champs que la personne (travailleur OU candidat pré-validé) peut renseigner.
const ALLOWED = ["full_name", "email", "birth_date", "nrn", "address", "postal_code", "city", "iban", "transport_type", "transport_frequency", "transport_price"] as const;

type Target = { table: "employees" | "candidates"; id: string; isCandidate: boolean };

// Karim 2026-07-03 : un token contract_info peut viser un EMPLOYÉ (dossier RH
// classique) ou un CANDIDAT pré-validé (lien de pré-embauche). On résout la cible.
async function resolveTarget(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<{ tokenId: string; target: Target } | null> {
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("id, employee_id, candidate_id")
    .eq("token", token)
    .maybeSingle();
  const tok = tokRaw as { id: string; employee_id: string | null; candidate_id: string | null } | null;
  if (!tok) return null;
  if (tok.candidate_id) return { tokenId: tok.id, target: { table: "candidates", id: tok.candidate_id, isCandidate: true } };
  if (tok.employee_id) return { tokenId: tok.id, target: { table: "employees", id: tok.employee_id, isCandidate: false } };
  return null;
}

function buildUpdate(values: Record<string, string>, isCandidate: boolean): { update: Record<string, unknown>; error?: string } {
  const update: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    const v = (values[k] ?? "").trim();
    if (v) update[k] = v;
  }
  // Statut étudiant / non-étudiant : uniquement pour un candidat pré-validé.
  if (isCandidate && typeof values.is_student === "string" && values.is_student !== "") {
    update.is_student = values.is_student === "true";
  }
  // Champs admin secrétariat social (candidat pré-validé, post-sélection).
  if (isCandidate) {
    for (const k of ["education_level", "nationality", "birth_place", "marital_status"]) {
      const v = (values[k] ?? "").trim();
      if (v) update[k] = v;
    }
    const dc = (values.dependent_children ?? "").trim();
    if (dc !== "") {
      const n = parseInt(dc, 10);
      if (Number.isFinite(n) && n >= 0) update.dependent_children = n;
    }
    // Karim 2026-07-05 : heures étudiant déjà consommées en 2026 (contingent).
    const sh = (values.student_hours_used_2026 ?? "").trim();
    if (sh !== "") {
      const n = parseInt(sh, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 2000) update.student_hours_used_2026 = n;
    }
  }
  if (typeof update.birth_date === "string" && update.birth_date > isoMinusYears(17)) {
    return { update, error: "La date de naissance doit correspondre à au moins 17 ans." };
  }
  return { update };
}

async function applyUpdate(
  admin: ReturnType<typeof createAdminClient>,
  target: Target,
  update: Record<string, unknown>,
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();
  const { data: subRow } = await admin.from(target.table).select("worker_field_submissions").eq("id", target.id).maybeSingle();
  const submissions: Record<string, string> = {
    ...(((subRow as { worker_field_submissions?: Record<string, string> } | null)?.worker_field_submissions) ?? {}),
  };
  for (const k of Object.keys(update)) submissions[k] = nowIso;
  const { error } = await admin.from(target.table).update({ ...update, worker_field_submissions: submissions }).eq("id", target.id);
  return { error: error?.message };
}

export async function submitContractInfoAction(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const resolved = await resolveTarget(admin, token);
  if (!resolved) return { ok: false, error: "Lien invalide ou expiré." };
  const { tokenId, target } = resolved;

  const { update, error: vErr } = buildUpdate(values, target.isCandidate);
  if (vErr) return { ok: false, error: vErr };
  // Karim 2026-07-07 (BUG bloquant) : un dossier DÉJÀ COMPLET peut être soumis sans
  // nouvelle saisie (rien à mettre à jour). On ne bloque plus avec « Aucune information
  // saisie » (qui empêchait de passer à l'écran de confirmation) ; on n'écrit que s'il
  // y a quelque chose à écrire, puis on marque le dossier transmis normalement.
  if (Object.keys(update).length > 0) {
    const { error } = await applyUpdate(admin, target, update);
    if (error) return { ok: false, error };
  }

  // Karim 2026-07-05 : mail récap + confirmation au candidat -> déclenché CÔTÉ SERVEUR
  // (fiable + loggé), plus en fire-and-forget client (qui avalait les erreurs).
  // L'anti-doublon (5 min) dans l'action évite les envois multiples.
  if (target.isCandidate) {
    try {
      const { sendCandidateRecapConfirmAction } = await import("./recap-actions");
      const rr = await sendCandidateRecapConfirmAction(token);
      if (!rr.ok && !("skipped" in rr && rr.skipped)) console.warn("[recap] échec:", rr.error);
    } catch (e) {
      console.warn("[recap] exception:", (e as Error).message);
    }
  }

  // Karim 2026-07-03 (audit) : IDEMPOTENCE — ne compléter + notifier qu'UNE fois.
  // Une re-soumission (retour arrière, double clic) ne doit pas dupliquer la notif RH.
  const { data: tokRow } = await admin.from("contract_info_tokens").select("completed_at").eq("id", tokenId).maybeSingle();
  if ((tokRow as { completed_at?: string | null } | null)?.completed_at) {
    return { ok: true };
  }
  await admin.from("contract_info_tokens").update({ completed_at: new Date().toISOString() }).eq("id", tokenId);

  // Notifie RH que le dossier avance (première complétion uniquement).
  try {
    // Karim 2026-07-03 : notif HONNÊTE — complet vs partiel (+ champs manquants).
    const essentials = target.isCandidate
      ? ["birth_date", "birth_place", "nrn", "nationality", "address", "postal_code", "city", "iban"]
      : ["birth_date", "nrn", "address", "postal_code", "city", "iban"];
    const { data: row } = await admin
      .from(target.table)
      .select(`full_name, ${essentials.join(", ")}`)
      .eq("id", target.id)
      .maybeSingle();
    const r = (row ?? {}) as Record<string, unknown>;
    const name = (r.full_name as string) ?? (target.isCandidate ? "Un candidat" : "Un employé");
    const missingEssentials = essentials.filter((k) => !r[k] || String(r[k]).trim() === "");
    const isComplete = missingEssentials.length === 0;
    // Karim 2026-07-03 : un candidat pré-validé n'a PAS de candidature -> la page
    // /rh/candidates/[id] (basée sur applications) renvoyait 404. Vue dédiée.
    const link = target.isCandidate ? `/rh/candidates/prevalidated/${target.id}` : `/planning/employees/${target.id}`;
    const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const LABELS: Record<string, string> = {
      birth_date: "date de naissance", birth_place: "lieu de naissance", nrn: "NISS",
      nationality: "nationalité", address: "adresse", postal_code: "code postal", city: "commune", iban: "IBAN",
    };
    const missingLabels = missingEssentials.map((k) => LABELS[k] ?? k).join(", ");
    const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
      recipient_id: p.id,
      kind: "reminder" as const,
      title: isComplete ? `Dossier COMPLET : ${name}` : `Dossier PARTIEL : ${name}`,
      body: isComplete
        ? (target.isCandidate ? `${name} (pré-validé) a complété tout son dossier d'embauche.` : `${name} a complété ses infos. Le contrat peut avancer.`)
        : `${name} a enregistré ses infos mais il MANQUE encore : ${missingLabels}. Le lien reste actif pour compléter.`,
      link,
      data: target.isCandidate ? { candidate_id: target.id } : { employee_id: target.id },
    }));
    if (inserts.length > 0) await admin.from("notifications").insert(inserts);
  } catch {
    /* notif best-effort */
  }
  return { ok: true };
}

/**
 * AUTO-SAVE instantané (sans soumettre). N'envoie pas la notif RH, ne marque pas
 * le token "complété". Fonctionne pour employé OU candidat pré-validé.
 */
export async function autosaveContractInfoAction(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const resolved = await resolveTarget(admin, token);
  if (!resolved) return { ok: false, error: "Lien invalide ou expiré." };
  const { target } = resolved;

  const { update, error: vErr } = buildUpdate(values, target.isCandidate);
  if (vErr) return { ok: false, error: vErr };
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await applyUpdate(admin, target, update);
  if (error) return { ok: false, error };
  return { ok: true };
}
