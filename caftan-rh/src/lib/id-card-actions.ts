"use server";

// Karim 2026-06-17 : actions de dépôt de la carte d'identité (recto/verso -> 1 PDF).
// Trois points d'entrée partageant le même cœur (saveIdCardForEmployee) :
//   - admin/RH depuis la fiche (saveIdCardAdminAction)
//   - travailleur connecté depuis /me/documents (saveIdCardMeAction)
//   - travailleur via son lien magique /contract-info (saveIdCardTokenAction)
// + envoi du PDF au secrétariat social / dossier RH (sendIdCardToSecsocAction).

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { saveIdCardForEmployee, saveIdCardForCandidate, getEmployeeIdCard, type IdCardImage } from "@/lib/id-card";

export type IdCardPayload = {
  rectoB64: string;
  rectoMime: string;
  versoB64: string;
  versoMime: string;
};

function decodeDataUrl(b64: string): Uint8Array {
  const comma = b64.indexOf(",");
  const raw = comma >= 0 ? b64.slice(comma + 1) : b64;
  return new Uint8Array(Buffer.from(raw, "base64"));
}

function toImages(p: IdCardPayload): IdCardImage[] {
  const imgs: IdCardImage[] = [];
  if (p.rectoB64) imgs.push({ bytes: decodeDataUrl(p.rectoB64), mime: p.rectoMime || "image/jpeg" });
  if (p.versoB64) imgs.push({ bytes: decodeDataUrl(p.versoB64), mime: p.versoMime || "image/jpeg" });
  return imgs;
}

export async function saveIdCardAdminAction(
  employeeId: string,
  p: IdCardPayload,
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const r = await saveIdCardForEmployee(admin, employeeId, toImages(p), profile.id);
  if (r.ok) revalidatePath(`/planning/employees/${employeeId}`);
  return r;
}

export async function saveIdCardMeAction(
  p: IdCardPayload,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté." };
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id").eq("profile_id", user.id).maybeSingle();
  if (!emp) return { ok: false, error: "Aucune fiche employé liée à ton compte." };
  const r = await saveIdCardForEmployee(admin, (emp as { id: string }).id, toImages(p), user.id);
  if (r.ok) {
    revalidatePath("/me/documents");
    revalidatePath(`/planning/employees/${(emp as { id: string }).id}`);
  }
  return r;
}

export async function saveIdCardTokenAction(
  token: string,
  p: IdCardPayload,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("contract_info_tokens")
    .select("employee_id, candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (!tok) return { ok: false, error: "Lien invalide ou expiré." };
  const t = tok as { employee_id: string | null; candidate_id: string | null };
  // Karim 2026-07-03 : le token peut viser un CANDIDAT pré-validé (pas encore
  // d'employé) — on stocke alors la CI liée au candidat (reprise à l'embauche).
  if (t.candidate_id) {
    const r = await saveIdCardForCandidate(admin, t.candidate_id, toImages(p), null);
    if (r.ok) revalidatePath(`/rh/candidates/prevalidated/${t.candidate_id}`);
    return r;
  }
  if (!t.employee_id) return { ok: false, error: "Lien invalide." };
  const r = await saveIdCardForEmployee(admin, t.employee_id, toImages(p), null);
  if (r.ok) revalidatePath(`/planning/employees/${t.employee_id}`);
  return r;
}

/** Envoie la carte d'identité (PDF) au secrétariat social / dossier RH par mail. */
export async function sendIdCardToSecsocAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const doc = await getEmployeeIdCard(admin, employeeId);
  if (!doc) return { ok: false, error: "Aucune carte d'identité enregistrée pour cet employé." };

  // Karim 2026-06-17 : on attache le VRAI fichier PDF (octets) — l'envoi par
  // « attachmentUrls » ne produisait aucune pièce jointe.
  const { data: blob, error: dlErr } = await admin.storage.from("documents").download(doc.storage_path);
  if (dlErr || !blob) return { ok: false, error: "Carte d'identité introuvable dans le stockage." };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { data: emp } = await admin.from("employees").select("full_name").eq("id", employeeId).maybeSingle();
  const name = (emp as { full_name?: string } | null)?.full_name ?? "Employé";

  try {
    const { sendMailWithAttachments } = await import("@/lib/mail-with-attachments");
    const res = await sendMailWithAttachments({
      to: "hr@caftanfactory.com",
      toName: "Secrétariat social / RH",
      subject: `Carte d'identité — ${name}`,
      body: `Bonjour,\n\nVeuillez trouver ci-joint la carte d'identité (recto/verso) de ${name} pour le dossier.\n\nEnvoyée par ${profile.full_name ?? profile.email}.\n\nCaftanRH`,
      attachments: [{ filename: doc.file_name, content: bytes, contentType: "application/pdf" }],
      source: "id_card_secsoc",
      sourceRef: employeeId,
      employeeId,
    });
    if (res && (res as { ok?: boolean }).ok === false) {
      return { ok: false, error: (res as { error?: string }).error ?? "Échec de l'envoi." };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Échec de l'envoi." };
  }
  return { ok: true };
}
