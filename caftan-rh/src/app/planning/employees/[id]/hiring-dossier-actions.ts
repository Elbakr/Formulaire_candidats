"use server";

// Karim 2026-07-04 : envoi 1-clic du DOSSIER D'EMBAUCHE complet (toutes les données
// pour formaliser l'embauche auprès du secrétariat social) + la carte d'identité en
// pièce jointe. Envoi MANUEL (déclenché par RH) vers hr@caftanfactory.com.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getEmployeeIdCard } from "@/lib/id-card";

export async function sendHiringDossierAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: eRaw } = await admin
    .from("employees")
    .select("full_name, email, phone, birth_date, birth_place, nrn, nationality, address, postal_code, city, iban, bic, bank_holder, contract_type, work_time_kind, weekly_hours, start_date, end_date, job_title, marital_status, dependent_children, education_level")
    .eq("id", employeeId)
    .maybeSingle();
  const e = eRaw as Record<string, unknown> | null;
  if (!e) return { ok: false, error: "Employé introuvable." };

  const v = (x: unknown) => (x === null || x === undefined || String(x).trim() === "" ? "—" : String(x));
  const workerType = e.contract_type === "Étudiant" ? "STU (étudiant)" : "OTH (travailleur ordinaire)";
  const regime = e.work_time_kind === "full" ? "temps plein" : e.work_time_kind === "part" ? "temps partiel" : "—";

  const body = `Bonjour,

Voici le dossier complet pour formaliser l'embauche de ${v(e.full_name)}.

── IDENTITÉ ─────────────────────────────
Nom complet          : ${v(e.full_name)}
Date de naissance    : ${v(e.birth_date)}
Lieu de naissance    : ${v(e.birth_place)}
Nationalité          : ${v(e.nationality)}
Numéro national NISS : ${v(e.nrn)}
Téléphone            : ${v(e.phone)}
Email                : ${v(e.email)}

── ADRESSE ──────────────────────────────
${[e.address, [e.postal_code, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}

── COORDONNÉES BANCAIRES ────────────────
IBAN                 : ${v(e.iban)}
BIC                  : ${v(e.bic)}
Titulaire            : ${v(e.bank_holder)}

── CONTRAT ──────────────────────────────
Type de contrat      : ${v(e.contract_type)}
Régime               : ${regime}
Heures / semaine     : ${v(e.weekly_hours)}
Date de début        : ${v(e.start_date)}
Date de fin          : ${e.end_date ? v(e.end_date) : "CDI (sans terme)"}
Poste                : ${v(e.job_title)}
Type Dimona          : ${workerType}

── SITUATION ────────────────────────────
État civil           : ${v(e.marital_status)}
Personnes à charge   : ${v(e.dependent_children)}
Niveau scolaire      : ${v(e.education_level)}

── DÉCLARATION DIMONA (ONSS) ────────────
À déclarer sur le portail ONSS :
https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm

Pièces jointes : carte d'identité (recto/verso) + contrat signé par les deux parties (si disponible).

Envoyé par ${profile.full_name ?? profile.email} — CaftanRH.`;

  const attachments: Array<{ filename: string; content: Uint8Array; contentType: string }> = [];
  // Carte d'identité.
  try {
    const doc = await getEmployeeIdCard(admin, employeeId);
    if (doc) {
      const { data: blob } = await admin.storage.from("documents").download(doc.storage_path);
      if (blob) attachments.push({ filename: doc.file_name, content: new Uint8Array(await blob.arrayBuffer()), contentType: "application/pdf" });
    }
  } catch { /* CI best-effort */ }
  // Contrat SIGNÉ par les 2 parties (dernier signé). PDF stocké à la signature.
  try {
    const { data: c } = await admin
      .from("employee_contracts")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("status", "signed")
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const contractId = (c as { id: string } | null)?.id;
    if (contractId) {
      const path = `contracts/${employeeId}/contrat-signe-${contractId}.pdf`;
      const { data: blob } = await admin.storage.from("documents").download(path);
      if (blob) attachments.push({ filename: `Contrat_signe_${v(e.full_name).replace(/[^A-Za-z0-9]+/g, "_")}.pdf`, content: new Uint8Array(await blob.arrayBuffer()), contentType: "application/pdf" });
    }
  } catch { /* contrat best-effort */ }

  try {
    const { sendMailWithAttachments } = await import("@/lib/mail-with-attachments");
    const res = await sendMailWithAttachments({
      to: "hr@caftanfactory.com",
      toName: "Secrétariat social / RH",
      subject: `Dossier d'embauche — ${v(e.full_name)}`,
      body,
      attachments,
      source: "hiring_dossier",
      sourceRef: employeeId,
      employeeId,
    });
    if (res && (res as { ok?: boolean }).ok === false) {
      return { ok: false, error: (res as { error?: string }).error ?? "Échec de l'envoi." };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Échec de l'envoi." };
  }
  return { ok: true, sentTo: "hr@caftanfactory.com" };
}
