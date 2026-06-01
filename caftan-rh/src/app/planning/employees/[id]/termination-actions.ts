"use server";

// Karim 2026-06-01 : actions server pour la rupture de contrat de commun accord
// (modèle 402.00). Couvre :
//   - initiateTerminationByRHAction       : admin/RH crée + approuve d'office
//   - requestTerminationByEmployeeAction  : worker demande → status=pending_admin
//   - approveTerminationAction            : admin valide une demande worker
//   - refuseTerminationAction             : admin refuse
//   - cancelTerminationAction
//   - sendTerminationForSignatureAction   : envoie le PDF + le log dans outbound_mails
//   - getTerminationPdfUrlAction          : retourne un signed URL pour affichage/impression
//
// PDF : rendu HTML via renderTerminationLetterHtml + stockage dans bucket
// "terminations". Pas de Puppeteer dispo en local → on stocke le HTML brut
// dans le bucket pour l'instant ; la conversion HTML→PDF côté print se fait
// via window.print sur la page de preview, et le mail embed le lien direct.
//
// Quand un service PDF (Puppeteer) sera dispo, swap dans generatePdf().

import { requireRole, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { renderTerminationLetterHtml } from "@/lib/termination-letter";
import { getPublicBaseUrl } from "@/lib/public-base-url";

interface ActionResult<T extends Record<string, unknown> = Record<string, unknown>> {
  ok?: boolean;
  error?: string;
  data?: T;
}

const EMPLOYER_INFO: Record<string, { name: string; address: string; city: string }> = {
  amd_megastore: { name: "AMD MEGASTORE SRL", address: "Rue de Brabant 230", city: "1030 Schaerbeek" },
  caftan_factory: { name: "Caftan Factory", address: "Rue de Brabant 230", city: "1030 Schaerbeek" },
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Stocke le HTML rendu de la lettre dans le bucket terminations.
 * Retourne le storage path.
 */
async function persistLetter(
  terminationId: string,
  html: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const path = `letter/${terminationId}.html`;
  const { error } = await admin.storage
    .from("terminations")
    .upload(path, new Blob([html], { type: "text/html" }), {
      contentType: "text/html",
      upsert: true,
    });
  if (error) {
    console.warn("[persistLetter] upload error:", error.message);
    return null;
  }
  return path;
}

async function buildLetterHtml(terminationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, employer_org_key, effective_date, city, employer_representative_name, requested_at")
    .eq("id", terminationId)
    .single();
  if (!t) return null;
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, address, city, postal_code")
    .eq("id", t.employee_id)
    .single();
  if (!emp) return null;
  const employer = EMPLOYER_INFO[t.employer_org_key] ?? EMPLOYER_INFO.amd_megastore;
  return renderTerminationLetterHtml({
    employer_org_name: employer.name,
    employer_address: employer.address,
    employer_city: employer.city,
    employer_representative_name: t.employer_representative_name,
    employee_full_name: emp.full_name ?? "",
    employee_address: emp.address ?? "",
    employee_city: emp.postal_code ? `${emp.postal_code} ${emp.city ?? ""}`.trim() : (emp.city ?? ""),
    effective_date_iso: t.effective_date ?? todayPlus(3),
    signing_city: t.city ?? "Schaerbeek",
    signing_date_iso: new Date().toISOString().slice(0, 10),
  });
}

/**
 * Karim 2026-06-01 : RH/admin initie une rupture amiable. status=approved
 * direct (pas de cooling-off pour les demandes admin).
 */
export async function initiateTerminationByRHAction(opts: {
  employeeId: string;
  effectiveDate: string;            // YYYY-MM-DD
  employerRepresentativeName: string;
  city?: string;
  approvalNote?: string;
}): Promise<ActionResult<{ terminationId: string }>> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id")
    .eq("id", opts.employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employee introuvable" };

  // Karim 2026-06-01 : pas de colonne employer_org_key sur employees ; on
  // infère via le payslip le plus récent (qui en a un), sinon fallback
  // amd_megastore (seul employeur actuellement actif).
  const { data: lastPayslip } = await admin
    .from("payslips")
    .select("employer_org_key")
    .eq("employee_id", opts.employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const employerOrgKey = (lastPayslip?.employer_org_key as string | undefined) ?? "amd_megastore";

  const { data: row, error } = await admin
    .from("contract_terminations")
    .insert({
      employee_id: opts.employeeId,
      employer_org_key: employerOrgKey,
      initiated_by: ["admin", "rh"].includes(profile.role) ? profile.role : "admin",
      initiator_profile_id: profile.id,
      status: "approved",
      approver_profile_id: profile.id,
      approved_at: new Date().toISOString(),
      approval_note: opts.approvalNote ?? null,
      effective_date: opts.effectiveDate,
      earliest_effective_date: todayPlus(0),
      city: opts.city ?? "Schaerbeek",
      employer_representative_name: opts.employerRepresentativeName,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Insert KO" };

  const html = await buildLetterHtml(row.id);
  if (html) {
    const path = await persistLetter(row.id, html);
    await admin.from("contract_terminations").update({ pdf_storage_path: path }).eq("id", row.id);
  }

  revalidatePath(`/planning/employees/${opts.employeeId}`);
  return { ok: true, data: { terminationId: row.id } };
}

/**
 * Karim 2026-06-01 : travailleur demande une rupture amiable.
 * Auto status=pending_admin + cooling-off 3 jours.
 */
export async function requestTerminationByEmployeeAction(opts: {
  reason?: string;
}): Promise<ActionResult<{ terminationId: string; earliestEffectiveDate: string }>> {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!emp) return { error: "Aucune fiche employé liée à ton compte" };

  const { data: lastPayslip } = await admin
    .from("payslips")
    .select("employer_org_key")
    .eq("employee_id", emp.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const employerOrgKey = (lastPayslip?.employer_org_key as string | undefined) ?? "amd_megastore";

  const requestedAt = new Date().toISOString();
  const earliest = todayPlus(3);
  const { data: row, error } = await admin
    .from("contract_terminations")
    .insert({
      employee_id: emp.id,
      employer_org_key: employerOrgKey,
      initiated_by: "employee",
      initiator_profile_id: user.id,
      requested_at: requestedAt,
      earliest_effective_date: earliest,
      status: "pending_admin",
      request_note: opts.reason ?? null,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Insert KO" };

  revalidatePath("/me/profile");
  return { ok: true, data: { terminationId: row.id, earliestEffectiveDate: earliest } };
}

/**
 * Karim 2026-06-01 : RH valide une demande worker.
 * Verifie la regle du 3 jours minimum si initie par employee.
 */
export async function approveTerminationAction(opts: {
  terminationId: string;
  effectiveDate: string;
  employerRepresentativeName: string;
  city?: string;
  note?: string;
}): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, initiated_by, earliest_effective_date, status")
    .eq("id", opts.terminationId)
    .single();
  if (!t) return { error: "Rupture introuvable" };
  if (t.status !== "pending_admin" && t.status !== "approved") {
    return { error: `Statut actuel ${t.status} ne permet pas la validation` };
  }
  if (t.initiated_by === "employee" && opts.effectiveDate < t.earliest_effective_date) {
    return {
      error: `Date effective trop tôt. Minimum requis : ${t.earliest_effective_date} (cooling-off 3 jours)`,
    };
  }

  await admin
    .from("contract_terminations")
    .update({
      status: "approved",
      approver_profile_id: profile.id,
      approved_at: new Date().toISOString(),
      approval_note: opts.note ?? null,
      effective_date: opts.effectiveDate,
      city: opts.city ?? "Schaerbeek",
      employer_representative_name: opts.employerRepresentativeName,
    })
    .eq("id", opts.terminationId);

  const html = await buildLetterHtml(opts.terminationId);
  if (html) {
    const path = await persistLetter(opts.terminationId, html);
    await admin.from("contract_terminations").update({ pdf_storage_path: path }).eq("id", opts.terminationId);
  }

  revalidatePath(`/planning/employees/${t.employee_id}`);
  revalidatePath("/rh/terminations");
  return { ok: true };
}

export async function refuseTerminationAction(opts: {
  terminationId: string;
  reason: string;
}): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, status")
    .eq("id", opts.terminationId)
    .single();
  if (!t) return { error: "Rupture introuvable" };
  if (t.status === "fully_signed" || t.status === "executed") {
    return { error: "Trop tard : la rupture est déjà signée/exécutée" };
  }
  await admin
    .from("contract_terminations")
    .update({
      status: "refused",
      approver_profile_id: profile.id,
      refusal_reason: opts.reason,
    })
    .eq("id", opts.terminationId);
  revalidatePath(`/planning/employees/${t.employee_id}`);
  revalidatePath("/rh/terminations");
  return { ok: true };
}

export async function cancelTerminationAction(terminationId: string): Promise<ActionResult> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin.from("contract_terminations").select("employee_id, status").eq("id", terminationId).single();
  if (!t) return { error: "Introuvable" };
  if (t.status === "fully_signed" || t.status === "executed") return { error: "Déjà exécutée" };
  await admin.from("contract_terminations").update({ status: "cancelled" }).eq("id", terminationId);
  revalidatePath(`/planning/employees/${t.employee_id}`);
  return { ok: true };
}

/**
 * Karim 2026-06-01 : retourne un signed URL pour ouvrir la lettre dans un
 * nouvel onglet (impression via window.print depuis la page).
 */
export async function getTerminationLetterUrlAction(
  terminationId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, pdf_storage_path")
    .eq("id", terminationId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Rupture introuvable" };

  // Karim 2026-06-01 : si la lettre n a pas ete persistee (rupture creee
  // avant le fix bucket mime), on la regenere a la volee.
  async function regenerate(): Promise<string | null> {
    const html = await buildLetterHtml(terminationId);
    if (!html) return null;
    const newPath = await persistLetter(terminationId, html);
    if (newPath) {
      await admin.from("contract_terminations").update({ pdf_storage_path: newPath }).eq("id", terminationId);
    }
    return newPath;
  }

  let path = t.pdf_storage_path as string | null;
  if (!path) {
    path = await regenerate();
    if (!path) return { ok: false, error: "Upload bucket KO (vérifie les mime_types autorisés)" };
  }

  let { data, error } = await admin.storage.from("terminations").createSignedUrl(path, 7 * 24 * 3600);
  // Karim 2026-06-01 : path en DB mais fichier disparu (upload silencieusement
  // raté avant le fix). On regenere puis on retente.
  if (error?.message?.toLowerCase().includes("not found") || (!data?.signedUrl && !error)) {
    const regenPath = await regenerate();
    if (regenPath) {
      const retry = await admin.storage.from("terminations").createSignedUrl(regenPath, 7 * 24 * 3600);
      data = retry.data;
      error = retry.error;
    }
  }
  if (error || !data?.signedUrl) return { ok: false, error: `Signed URL KO: ${error?.message ?? "no url"}` };
  return { ok: true, url: data.signedUrl };
}

/**
 * Karim 2026-06-01 : envoie la lettre par mail au travailleur pour signature.
 * Pour l'instant : mail simple avec lien vers la lettre HTML (signed URL 7j).
 * Quand DocuSeal sera branché sur ce template, on remplacera ici.
 */
export async function sendTerminationForSignatureAction(
  terminationId: string,
): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, status, pdf_storage_path, effective_date")
    .eq("id", terminationId)
    .single();
  if (!t) return { error: "Introuvable" };
  if (t.status !== "approved") return { error: "Doit être approuvée avant envoi" };
  if (!t.pdf_storage_path) return { error: "Lettre non générée" };

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, email, preferred_language")
    .eq("id", t.employee_id)
    .single();
  if (!emp?.email) return { error: "Email employee manquant" };

  const { data: signed } = await admin.storage.from("terminations").createSignedUrl(t.pdf_storage_path, 7 * 24 * 3600);
  if (!signed?.signedUrl) return { error: "URL KO" };

  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { error: "EmailJS non configuré" };

  const firstName = emp.full_name?.split(" ")[0] ?? "";
  const baseUrl = getPublicBaseUrl();
  const body = `Bonjour ${firstName},

Une convention de cessation de contrat de travail de COMMUN ACCORD t'est transmise pour signature.

Date de fin du contrat proposée : ${t.effective_date}

Tu peux consulter et signer la lettre ici :
${signed.signedUrl}

Tu retrouveras également cette lettre dans ton espace travailleur :
${baseUrl}/me/documents

Bien à toi,
L'équipe Caftan Factory (By AMD Megastore)`;

  const params = {
    to_email: emp.email, email: emp.email, user_email: emp.email, candidate_email: emp.email,
    to: emp.email, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: `Convention de cessation de contrat - signature requise`,
    message: body, html_message: body.replace(/\n/g, "<br>"),
    body, content: body, html: body.replace(/\n/g, "<br>"),
    pdf_url: signed.signedUrl,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  if (!res.ok) return { error: `Mail HTTP ${res.status}` };

  // Log mail + audit
  try {
    const { logOutboundMail } = await import("@/lib/outbound-mail-log");
    const r = await logOutboundMail({
      recipient_email: emp.email,
      recipient_name: emp.full_name,
      subject: "Convention de cessation de contrat - signature requise",
      body,
      source: "contract_signature",
      source_ref: terminationId,
      employee_id: t.employee_id,
      sender_profile_id: profile.id,
      attachments: [{ name: "Convention de cessation.html", url: signed.signedUrl }],
    });
    if (r.id) {
      await admin
        .from("contract_terminations")
        .update({ email_outbound_id: r.id, sent_for_signature_at: new Date().toISOString(), status: "sent_for_signature" })
        .eq("id", terminationId);
    } else {
      await admin
        .from("contract_terminations")
        .update({ sent_for_signature_at: new Date().toISOString(), status: "sent_for_signature" })
        .eq("id", terminationId);
    }
    const { logDocAudit } = await import("@/lib/document-audit-log");
    await logDocAudit({
      employee_id: t.employee_id,
      doc_type: "contract",
      doc_ref: terminationId,
      doc_label: "Convention cessation contrat commun accord",
      action: "share_email",
      channel: "emailjs",
      actor_profile_id: profile.id,
      recipient_email: emp.email,
      signed_url_path: t.pdf_storage_path,
    });
  } catch (e) {
    console.warn("log error:", (e as Error).message);
  }

  revalidatePath(`/planning/employees/${t.employee_id}`);
  return { ok: true };
}
