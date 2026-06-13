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

/**
 * Karim 2026-06-02 : retourne l'historique des ruptures pour un employee
 * + l'email de l'employee. Sert au dialog admin pour montrer le destinataire
 * exact + eviter les doublons d'envoi.
 */
export async function getTerminationContextAction(
  employeeId: string,
): Promise<{
  ok: boolean;
  employee_email: string | null;
  history: Array<{
    id: string;
    status: string;
    initiated_by: string;
    requested_at: string;
    effective_date: string | null;
    sent_for_signature_at: string | null;
    initiator_name: string | null;
    employer_representative_name: string | null;
  }>;
}> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("email").eq("id", employeeId).maybeSingle();
  const { data: rows } = await admin
    .from("contract_terminations")
    .select(`
      id, status, initiated_by, requested_at, effective_date, sent_for_signature_at,
      employer_representative_name,
      initiator:profiles!initiator_profile_id(full_name)
    `)
    .eq("employee_id", employeeId)
    .order("requested_at", { ascending: false })
    .limit(20);
  return {
    ok: true,
    employee_email: (emp?.email as string | null) ?? null,
    history: (rows ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      initiated_by: r.initiated_by as string,
      requested_at: r.requested_at as string,
      effective_date: (r.effective_date as string | null) ?? null,
      sent_for_signature_at: (r.sent_for_signature_at as string | null) ?? null,
      initiator_name: ((r as { initiator?: { full_name: string } | null }).initiator?.full_name) ?? null,
      employer_representative_name: (r.employer_representative_name as string | null) ?? null,
    })),
  };
}

/**
 * Karim 2026-06-02 : poll DocuSeal API et synchronise le statut local.
 * Fallback si le webhook DocuSeal n'a pas firé. Si la submission est
 * completed cote DocuSeal mais pas chez nous, on declenche les notifs/mail.
 */
export async function syncTerminationDocusealAction(
  terminationId: string,
): Promise<{ ok: boolean; updated: boolean; status?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, docuseal_submission_id, status, effective_date")
    .eq("id", terminationId)
    .maybeSingle();
  if (!t) return { ok: false, updated: false, error: "Rupture introuvable" };
  if (!t.docuseal_submission_id) return { ok: false, updated: false, error: "Pas de submission DocuSeal" };

  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, updated: false, error: "DocuSeal non configuré" };

  const res = await fetch(`${baseUrl}/submissions/${t.docuseal_submission_id}`, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) return { ok: false, updated: false, error: `DocuSeal HTTP ${res.status}` };
  const data = (await res.json()) as {
    status?: string;
    completed_at?: string;
    combined_document_url?: string;
    documents?: Array<{ url: string }>;
    submitters?: Array<{ role: string; status: string; completed_at?: string }>;
  };

  const isCompleted = data.status === "completed" || data.submitters?.every((s) => s.status === "completed");
  if (!isCompleted) return { ok: true, updated: false, status: data.status ?? "in_progress" };
  if (t.status === "fully_signed") return { ok: true, updated: false, status: "fully_signed" };

  // Webhook a raté → on fait le boulot ici
  const docusealPdfUrl = data.documents?.[0]?.url ?? data.combined_document_url ?? null;
  let storedPath: string | null = null;
  if (docusealPdfUrl) {
    try {
      const pdfRes = await fetch(docusealPdfUrl);
      if (pdfRes.ok) {
        const bytes = new Uint8Array(await pdfRes.arrayBuffer());
        storedPath = `signed/${terminationId}.pdf`;
        await admin.storage.from("terminations").upload(storedPath, bytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      }
    } catch (e) {
      console.warn("[syncTermination] PDF upload err:", (e as Error).message);
    }
  }

  const nowISO = data.completed_at ?? new Date().toISOString();
  await admin
    .from("contract_terminations")
    .update({
      status: "fully_signed",
      signed_pdf_storage_path: storedPath ?? docusealPdfUrl,
      employee_signed_at: nowISO,
      employer_signed_at: nowISO,
    })
    .eq("id", terminationId);

  // Karim 2026-06-13 (Phase 3) : rupture pleinement signée par les 2 parties
  // (décision/signature humaine faite) -> clôture automatisée de l'emploi
  // (archive à la date effective + Dimona OUT préparée + coupe accès + notice).
  try {
    const { closeEmployment } = await import("@/lib/employment-lifecycle");
    await closeEmployment(admin, t.employee_id, t.effective_date, "termination", { sendNotice: true });
  } catch { /* best-effort */ }

  // Notifs + mail HR + mail employee + audit (replique du webhook)
  try {
    const { data: emp } = await admin.from("employees").select("full_name, email").eq("id", t.employee_id).maybeSingle();
    const empName = (emp as { full_name?: string } | null)?.full_name ?? "?";
    const empEmail = (emp as { email?: string } | null)?.email ?? null;
    let signedUrl: string | null = docusealPdfUrl;
    if (storedPath) {
      const { data: s } = await admin.storage.from("terminations").createSignedUrl(storedPath, 7 * 24 * 3600);
      if (s?.signedUrl) signedUrl = s.signedUrl;
    }

    // Notifications
    const { data: hrs } = await admin.from("profiles").select("id, email").in("role", ["admin", "rh"]);
    const hrList = (hrs ?? []) as Array<{ id: string; email: string | null }>;
    if (hrList.length > 0) {
      await admin.from("notifications").insert(
        hrList.map((hr) => ({
          recipient_id: hr.id,
          kind: "termination_signed",
          title: `✍️ Rupture signée — ${empName}`,
          body: `Convention pleinement signée (sync manuel via UI).`,
          link: `/planning/employees/${t.employee_id}`,
          data: { terminationId, signedUrl, effective_date: t.effective_date },
        })),
      );
    }

    // Mail HR + employee (replique du webhook)
    const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    const baseAppUrl = getPublicBaseUrl();
    if (SERVICE && TEMPLATE && KEY && signedUrl) {
      const recipients = new Set<string>(["hr@caftanfactory.com", ...hrList.map((h) => h.email).filter((e): e is string => !!e)]);
      const subject = `Convention de rupture signée — ${empName}`;
      const body = `Bonjour,\n\nLa convention de cessation de contrat de ${empName} a été signée par les 2 parties.\n\n📅 Date de fin : ${t.effective_date}\n\n📎 PDF signé (lien 7j) :\n${signedUrl}\n\nValise documents : ${baseAppUrl}/rh/documents?employee=${t.employee_id}\n\n⚠ Actions : Dimona OUT · solde tout compte · certificat C4.\n\nL'équipe CaftanRH`;
      for (const to of recipients) {
        try {
          await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost" },
            body: JSON.stringify({
              service_id: SERVICE, template_id: TEMPLATE, user_id: KEY,
              template_params: {
                from_name: "CaftanRH - Rupture signée", reply_to: "hr@caftanfactory.com",
                subject, message: body, html_message: body.replace(/\n/g, "<br>"),
                body, content: body, html: body.replace(/\n/g, "<br>"),
                to_email: to, email: to, user_email: to, candidate_email: to,
                to, to_name: "RH", name: "RH", candidate_name: "RH",
                pdf_url: signedUrl,
              },
            }),
          });
        } catch { /* */ }
      }

      if (empEmail) {
        const empFirst = empName.split(/\s+/)[0];
        const empBody = `Bonjour ${empFirst},\n\nTa convention de cessation de contrat amiable est signée par les 2 parties.\n\n📅 Date de fin : ${t.effective_date}\n\n📎 Télécharge ton PDF :\n${signedUrl}\n\nÉgalement dans ton espace : ${baseAppUrl}/me/termination\n\nL'équipe Caftan Factory`;
        try {
          await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost" },
            body: JSON.stringify({
              service_id: SERVICE, template_id: TEMPLATE, user_id: KEY,
              template_params: {
                from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
                subject: `Ta convention signée — ${empName}`,
                message: empBody, html_message: empBody.replace(/\n/g, "<br>"),
                body: empBody, content: empBody, html: empBody.replace(/\n/g, "<br>"),
                to_email: empEmail, email: empEmail, user_email: empEmail, candidate_email: empEmail,
                to: empEmail, to_name: empName, name: empName, candidate_name: empName,
                pdf_url: signedUrl,
              },
            }),
          });
          const { logOutboundMail } = await import("@/lib/outbound-mail-log");
          await logOutboundMail({
            recipient_email: empEmail,
            recipient_name: empName,
            subject: `Ta convention signée — ${empName}`,
            body: empBody,
            source: "contract_signature",
            source_ref: terminationId,
            employee_id: t.employee_id,
            attachments: [{ name: "Convention signée.pdf", url: signedUrl }],
          });
        } catch { /* */ }
      }
    }

    // Audit
    await admin.from("document_audit_log").insert({
      employee_id: t.employee_id,
      doc_type: "contract",
      doc_ref: terminationId,
      doc_label: "Convention rupture - pleinement signée (sync manuel)",
      action: "view",
      channel: "docuseal_sync_manual",
      actor_name: "Sync manuel UI",
    });
  } catch (e) {
    console.warn("[syncTermination] notify err:", (e as Error).message);
  }

  revalidatePath(`/planning/employees/${t.employee_id}`);
  return { ok: true, updated: true, status: "fully_signed" };
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
/**
 * Karim 2026-06-01 : renvoie un PATH RELATIF vers la lettre rendue cote
 * serveur. Le client le combine a window.location.origin pour rester
 * meme-origine (donc cookies de session preserves). Pas de dependance
 * au bucket pour l affichage.
 */
export async function getTerminationLetterUrlAction(
  terminationId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id")
    .eq("id", terminationId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Rupture introuvable" };
  // Path relatif - le client utilisera window.location.origin
  return { ok: true, url: `/api/terminations/${terminationId}/letter` };
}

/**
 * Build URL avec token base64 pour partage externe (mail). exp = 7 jours.
 */
function buildPublicLetterUrl(terminationId: string): string {
  const baseUrl = getPublicBaseUrl();
  const payload = { id: terminationId, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${baseUrl}/api/terminations/${terminationId}/letter?t=${b64}`;
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
  // Karim 2026-06-01 : autorise approved (premier envoi) ET sent_for_signature
  // (renvoi du mail si le worker a perdu le lien ou si on relance).
  if (!["approved", "sent_for_signature"].includes(t.status)) {
    return { error: `Statut ${t.status} : la rupture doit d'abord être approuvée par RH` };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, email, preferred_language, address, city, postal_code")
    .eq("id", t.employee_id)
    .single();
  if (!emp?.email) return { error: "Email employee manquant" };

  // Karim 2026-06-01 : flow DocuSeal Cloud — vrai PDF A4 + signature
  // électronique légale (eIDAS) pour les 2 parties. Remplace l'ancien
  // mail simple avec lien HTML.
  const { data: tDetails } = await admin
    .from("contract_terminations")
    .select("employer_org_key, city, employer_representative_name, effective_date")
    .eq("id", terminationId)
    .single();
  if (!tDetails) return { error: "Détails rupture KO" };

  const EMPLOYER_INFO: Record<string, { name: string; address: string; city: string; email: string }> = {
    amd_megastore: { name: "AMD MEGASTORE SRL", address: "Rue de Brabant 230", city: "1030 Schaerbeek", email: "hr@caftanfactory.com" },
    caftan_factory: { name: "Caftan Factory", address: "Rue de Brabant 230", city: "1030 Schaerbeek", email: "hr@caftanfactory.com" },
  };
  const employer = EMPLOYER_INFO[tDetails.employer_org_key as string] ?? EMPLOYER_INFO.amd_megastore;
  const employerSignerEmail = (process.env.DOCUSEAL_EMPLOYER_EMAIL ?? "elbazikarim@gmail.com").trim();

  // Karim 2026-06-01 : charge la signature stockee de l'admin (pattern
  // identique aux contrats). Si dispo, le PDF DocuSeal embed la signature
  // employeur en image → 1 seul signataire (Employee).
  const { data: sigRow } = await admin
    .from("profiles")
    .select("signature_data_url")
    .eq("id", profile.id)
    .maybeSingle();
  const employerSignatureDataUrl = (sigRow as { signature_data_url: string | null } | null)?.signature_data_url ?? null;

  const { createTerminationTemplate, createTerminationSubmission } = await import("@/lib/docuseal-termination");
  const tmpl = await createTerminationTemplate({
    employer_org_name: employer.name,
    employer_address: employer.address,
    employer_city: employer.city,
    employer_representative_name: tDetails.employer_representative_name as string | null,
    employee_full_name: emp.full_name ?? "",
    employee_address: emp.address ?? "",
    employee_city: emp.postal_code ? `${emp.postal_code} ${emp.city ?? ""}`.trim() : (emp.city ?? ""),
    effective_date_iso: (tDetails.effective_date as string) ?? new Date().toISOString().slice(0, 10),
    signing_city: (tDetails.city as string) ?? "Schaerbeek",
    signing_date_iso: new Date().toISOString().slice(0, 10),
    templateNameSuffix: terminationId.slice(0, 8),
    employerSignatureDataUrl,
  });
  if (!tmpl.ok) return { error: tmpl.error };

  const sub = await createTerminationSubmission({
    templateId: tmpl.templateId,
    employeeName: emp.full_name ?? "",
    employeeEmail: emp.email,
    employerName: (tDetails.employer_representative_name as string) || "Karim Elbazi",
    employerEmail: employerSignerEmail,
    metadata: { termination_id: terminationId },
    replyTo: "hr@caftanfactory.com",
    preSigned: !!employerSignatureDataUrl,
  });
  if (!sub.ok) return { error: sub.error };

  const employeeSigningUrl = sub.signingUrls.find((s) => s.role === "Employee")?.url;
  if (!employeeSigningUrl) return { error: "DocuSeal n'a pas retourné l'URL signature employee" };
  const employerSigningUrl = sub.signingUrls.find((s) => s.role === "Employer")?.url;

  // Stocke submission_id pour récupération du PDF signé plus tard
  await admin
    .from("contract_terminations")
    .update({ docuseal_submission_id: String(sub.submissionId) })
    .eq("id", terminationId);

  const signed = { signedUrl: employeeSigningUrl };
  const employerLinkLine = employerSigningUrl
    ? `\n\nLien signature employeur (pour Karim/RH) :\n${employerSigningUrl}`
    : "";

  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { error: "EmailJS non configuré" };

  const firstName = emp.full_name?.split(" ")[0] ?? "";
  const baseUrl = getPublicBaseUrl();
  const body = `Bonjour ${firstName},

Une convention de cessation de contrat de travail de COMMUN ACCORD t'est transmise pour signature électronique.

Date de fin du contrat proposée : ${t.effective_date}

Pour signer la convention (PDF A4 légal, signature électronique sécurisée) :
${signed.signedUrl}

La signature électronique a la même valeur légale qu'une signature manuscrite
(règlement eIDAS UE n° 910/2014). Tu recevras automatiquement le PDF signé
final par les deux parties dès que tout sera complété.

Tu retrouveras également cette convention dans ton espace travailleur :
${baseUrl}/me/termination${employerLinkLine}

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
