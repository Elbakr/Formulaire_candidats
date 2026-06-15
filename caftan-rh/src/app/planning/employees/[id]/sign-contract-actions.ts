"use server";

// Karim 2026-05-29 : action server "Envoyer contrat a signer via DocuSeal".
// Charge le template Markdown depuis BD, render avec les donnees employee
// reelles, POST /templates/html sur DocuSeal, puis POST /submissions avec
// 2 signataires (employer + employee). Persist en BD un employee_contracts
// avec docuseal_submission_id pour tracking ulterieur (webhook).

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  createDocusealTemplateFromContract,
  createSubmissionForContract,
  buildContractHtmlForDocuseal_publicForPreview,
  type ContractLang,
} from "@/lib/docuseal-flow";
import { EMPLOYER_ORGS, type EmployerOrgKey } from "@/lib/contract-renderer";
import { resolveContractRenderInputs, type ContractDiscrepancy } from "@/lib/contract-render-inputs";
import { getOutboundBaseUrl } from "@/lib/public-base-url";

/**
 * Karim 2026-05-30 : envoie une copie du contrat à signer à l'employeur
 * (hr@caftanfactory.com ou autre) pour archive et sécurité.
 */
async function sendEmployerCopyMail(args: {
  employerEmail: string;
  employeeName: string;
  employeeEmail: string;
  signingUrl: string;
  employerName: string;
  templateLabel: string;
}): Promise<void> {
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return;

  const body = `Bonjour,

📋 ARCHIVE CONTRAT — Un contrat ${args.templateLabel} a été envoyé à signer.

Destinataire : ${args.employeeName} (${args.employeeEmail})
Lien de signature :
${args.signingUrl}

Ce mail sert d'archive employeur (sécurité légale).
Si tu n'as pas effectué cet envoi, contacte un admin immédiatement.

CaftanRH
`;
  const params = {
    to_email: args.employerEmail, email: args.employerEmail, user_email: args.employerEmail,
    to: args.employerEmail, to_name: "Employeur", name: "Employeur",
    candidate_name: "Employeur", candidate_email: args.employerEmail,
    from_name: "CaftanRH (archive)", reply_to: "hr@caftanfactory.com",
    subject: `[Archive] Contrat envoyé à ${args.employeeName}`,
    message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    signing_url: args.signingUrl,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  // Karim 2026-05-31 : archive la copie employeur dans outbound_mails
  try {
    const { logOutboundMail } = await import("@/lib/outbound-mail-log");
    await logOutboundMail({
      recipient_email: args.employerEmail,
      recipient_name: "Employeur (archive)",
      subject: `[Archive] Contrat envoyé à ${args.employeeName}`,
      body,
      source: "contract_employer_archive",
      attachments: [{ name: "Lien de signature", url: args.signingUrl }],
      status: res.ok ? "sent" : "failed",
    });
  } catch {}
}

/**
 * Karim 2026-05-30 : SEULS les representants legaux declares dans EMPLOYER_ORGS
 * (representative + co_representative) peuvent figurer sur le contrat.
 * Si le profile connecte matche l un des 2, on l affiche. Sinon : default Karim.
 */
function pickAuthorizedRepresentative(
  connectedName: string | null,
  org: typeof EMPLOYER_ORGS[EmployerOrgKey],
): string {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[éè]/g, "e").replace(/[^a-z]/g, "");
  const allowed = [org.representative, org.co_representative].filter(Boolean) as string[];
  const connectedNorm = norm(connectedName ?? "");
  for (const name of allowed) {
    if (norm(name) === connectedNorm) return name;
  }
  // Fallback : representative officiel (Karim Elbazi pour AMD Megastore)
  return org.representative;
}
import { sendContractSignatureMail } from "@/lib/hr-mail";

type Args = {
  employeeId: string;
  templateCode: "employee" | "employee_pt" | "student";
  orgKey: EmployerOrgKey;
  employerEmail: string;
  // Karim 2026-05-30 : body mail personnalise (sinon defaut MAIL_MESSAGES)
  // Variables remplacees : {first_name}, {employer_name}, {signing_url}
  customMailBody?: string;
  // Karim 2026-06-03 : bypass admin warnings screening, raison loggee
  bypassScreening?: { reason: string };
  // Karim 2026-06-15 : l'opérateur a vu les discordances fiche<->contrat et valide
  // -> on envoie ET on aligne la fiche sur le contrat. Sans ce flag, on bloque et
  // on renvoie la liste des discordances pour validation.
  acceptDiscrepancies?: boolean;
};

export async function sendContractViaDocusealAction(
  args: Args,
): Promise<{ ok?: true; error?: string; submissionId?: number }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee manquant." };
  if (!args.employerEmail || !/.+@.+\..+/.test(args.employerEmail)) {
    return { error: "Email employeur invalide." };
  }

  const supabase = await createClient();

  // 1. Charge l employee + son site primaire + langue
  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name, email, nrn, address, postal_code, city, job_title, weekly_hours, hourly_rate, contract_type, start_date, end_date, iban, bic, preferred_language")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!empRaw) return { error: "Employé introuvable." };
  const employee = empRaw as {
    id: string;
    full_name: string;
    email: string | null;
    nrn: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    job_title: string | null;
    weekly_hours: number | null;
    hourly_rate: number | null;
    contract_type: string | null;
    start_date: string | null;
    end_date: string | null;
    iban: string | null;
    bic: string | null;
    preferred_language: string | null;
  };
  const lang: ContractLang = (employee.preferred_language === "nl" || employee.preferred_language === "en") ? employee.preferred_language : "fr";

  // Karim 2026-05-30 : RÈGLE LÉGALE INVIOLABLE - contrat doit être signé AVANT
  // la date de début (sinon devient CDI selon loi belge du 3 juillet 1978 art. 9).
  //
  // DÉROGATION AUTO admin : si start_date < today ET role=admin, on REDIRIGE
  // automatiquement l email destinataire vers l email de l admin connecté
  // (= cadre test, le contrat est envoyé à l'admin pour qu'il signe à la place
  // sans aucun risque de requalification d'un vrai employé).
  // Aucune action manuelle dans /admin/legal-rules requise.
  const todayISO = new Date().toISOString().slice(0, 10);
  let backdatedTestRedirect = false;
  // Karim 2026-05-31 : check screening completed + RH validated avant tout envoi
  // (sauf si l employee n a pas de candidate_id - cas particulier)
  const { data: empCand } = await supabase
    .from("employees")
    .select("candidate_id")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (empCand?.candidate_id) {
    const { data: scr } = await supabase
      .from("screening_responses")
      .select("completed_at, rh_decision_at, recommendation")
      .eq("candidate_id", empCand.candidate_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Karim 2026-06-03 : si bypass fourni avec raison, on saute les checks
    // mais on logge l'override pour audit
    if (args.bypassScreening?.reason) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const adminCli = createAdminClient();
        await adminCli.from("activity_log").insert({
          profile_id: profile.id,
          action: "contract_screening_bypassed",
          target_type: "employee",
          target_id: args.employeeId,
          body: `Bypass admin checks screening pour envoi contrat. Raison : ${args.bypassScreening.reason}. État screening : ${scr?.completed_at ? "complet" : "incomplet"}, recommandation=${scr?.recommendation ?? "n/a"}, validé_RH=${scr?.rh_decision_at ? "oui" : "non"}.`,
        });
      } catch {/* non bloquant */}
    } else {
      if (!scr || !scr.completed_at) {
        return { error: "⛔ Le candidat doit d abord compléter le questionnaire de profilage (/me/screening). Envoie-lui le lien — ou utilise le bypass admin avec raison." };
      }
      if (scr.recommendation === "PASS") {
        return { error: "⛔ Le système recommande de ne PAS embaucher ce candidat (recommandation PASS). Vérifie le screening dans /rh/screening — ou bypass admin avec raison." };
      }
      if (!scr.rh_decision_at) {
        return { error: "⛔ Le screening est complet mais doit être VALIDÉ par RH avant l envoi du contrat. Voir /rh/screening — ou bypass admin avec raison." };
      }
    }
  }

  if (employee.start_date && employee.start_date < todayISO) {
    if (profile.role === "admin" && profile.email) {
      console.warn(
        `[CONTRACT BACKDATED] start_date=${employee.start_date} < ${todayISO}. ` +
        `Redirection email destinataire ${employee.email} -> ${profile.email} (admin self-test).`,
      );
      employee.email = profile.email;
      backdatedTestRedirect = true;
    } else {
      return {
        error:
          `⛔ Date de début (${employee.start_date}) dans le passé. ` +
          `Un contrat non signé avant l entrée en service devient CDI ` +
          `selon la loi 3 juillet 1978 art. 9. Recule la date de début ou ` +
          `contacte un admin (qui pourra tester en se redirigeant l'envoi).`,
      };
    }
  }

  // 1b. Charge la signature stockee de Karim (si elle existe)
  const { data: sigRaw } = await supabase
    .from("profiles")
    .select("signature_data_url")
    .eq("id", profile.id)
    .maybeSingle();
  const employerSignatureDataUrl = (sigRaw as { signature_data_url: string | null } | null)?.signature_data_url ?? null;
  if (!employee.email) return { error: "Email employé manquant - complète la fiche d'abord." };

  // Site primaire (optionnel)
  const today = new Date().toISOString().slice(0, 10);
  const { data: assignRaw } = await supabase
    .from("site_assignments")
    .select("site:sites(id, code, name, address, city)")
    .eq("employee_id", args.employeeId)
    .eq("is_primary", true)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .maybeSingle();
  const primarySite = (assignRaw as { site: { id: string; code: string; name: string; address: string | null; city: string | null } | null } | null)?.site ?? null;

  // 2. Charge le template Markdown
  const { data: tplRaw } = await supabase
    .from("contract_templates")
    .select("code, name, body_markdown")
    .eq("code", args.templateCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!tplRaw) return { error: `Template ${args.templateCode} introuvable ou inactif.` };
  const template = tplRaw as { code: string; name: string; body_markdown: string };

  // 3. Cree le template DocuSeal a partir du markdown rendu (pré-signé si possible)
  const orgInfo = EMPLOYER_ORGS[args.orgKey];
  const tplResult = await createDocusealTemplateFromContract({
    templateCode: args.templateCode,
    templateBodyMarkdown: template.body_markdown,
    employeeData: employee,
    employerOrg: args.orgKey,
    primarySite: primarySite ? { code: primarySite.code, name: primarySite.name, address: primarySite.address, city: primarySite.city } : null,
    employerSignatureDataUrl, // ← signature stockee Karim
    // Karim 2026-05-30 : SEULS les representants legaux de l org peuvent etre cites
    // (Karim Elbazi OU Kamal Elbazi pour AMD Megastore). Si le profile connecte
    // est l un des 2, on l affiche. Sinon, fallback = representative officiel (Karim).
    employerRepresentativeOverride: pickAuthorizedRepresentative(
      profile.full_name,
      EMPLOYER_ORGS[args.orgKey],
    ),
  });
  if (!tplResult.ok) return { error: tplResult.error };

  // 4. Cree la submission - 1 seul signataire (employee) si Karim deja pre-signe
  // - send_email: false -> CaftanRH envoie le mail lui-meme via hr@caftanfactory.com
  const subResult = await createSubmissionForContract({
    templateId: tplResult.templateId,
    employeeName: employee.full_name,
    employeeEmail: employee.email,
    employerName: orgInfo.representative,
    employerEmail: args.employerEmail,
    language: lang,
    preSigned: !!employerSignatureDataUrl,
    replyTo: "hr@caftanfactory.com",
    metadata: {
      employee_id: employee.id,
      template_code: args.templateCode,
      org_key: args.orgKey,
      sent_by: profile.full_name ?? "RH",
      language: lang,
      pre_signed: employerSignatureDataUrl ? "true" : "false",
    },
  });
  if (!subResult.ok) return { error: subResult.error };

  // 4b. Envoie le mail via EmailJS depuis hr@caftanfactory.com avec le lien signature
  const employeeSigningUrl = subResult.signingUrls.find((u) => u.role === "Employee")?.url;
  if (employeeSigningUrl) {
    const mailRes = await sendContractSignatureMail({
      employeeName: employee.full_name,
      employeeEmail: employee.email,
      signingUrl: employeeSigningUrl,
      employerName: orgInfo.name,
      language: lang,
      customBody: args.customMailBody,
    });
    if (mailRes.error) {
      console.warn("[sendContractViaDocuseal] mail err:", mailRes.error);
    }
    // Karim 2026-05-30 : COPIE EMPLOYEUR pour archive + securite (selon demande)
    // Le mail va a employerEmail (defaut hr@caftanfactory.com) avec le meme lien
    // signature - utile pour avoir une trace côté employeur.
    try {
      await sendEmployerCopyMail({
        employerEmail: args.employerEmail,
        employeeName: employee.full_name,
        employeeEmail: employee.email,
        signingUrl: employeeSigningUrl,
        employerName: orgInfo.name,
        templateLabel: args.templateCode,
      });
    } catch (e) {
      console.warn("[sendEmployerCopyMail] err:", (e as Error).message);
    }
  } else {
    console.warn("[sendContractViaDocuseal] pas d URL de signature trouvee dans la submission");
  }

  // 5. Persist en employee_contracts (track docuseal_submission_id)
  try {
    await supabase.from("employee_contracts").insert({
      employee_id: employee.id,
      contract_kind: args.templateCode === "student" ? "Étudiant" : "CDD",
      template_code: args.templateCode,
      docuseal_submission_id: subResult.submissionId,
      docuseal_status: "sent",
      prepared_at: new Date().toISOString(),
      prepared_by: profile.full_name ?? "RH",
      employer_org_key: args.orgKey,
    });
  } catch (e) {
    // table peut avoir des colonnes manquantes (employer_org_key, template_code)
    // - ce n est pas bloquant pour la signature DocuSeal qui est deja envoyee
    console.warn("[sendContractViaDocuseal] insert employee_contracts:", e);
  }

  revalidatePath(`/planning/employees/${args.employeeId}`);
  revalidatePath(`/planning/employees/${args.employeeId}/contract`);
  return { ok: true, submissionId: subResult.submissionId };
}

// ===========================================================================
// Karim 2026-06-15 : ENVOI À SIGNER — SYSTÈME INTERNE /sign (décision validée).
//
// Remplace l'usage de DocuSeal cloud (lien externe fragile -> 404 candidat).
// Le candidat signe sur la prod stable (caftan-rh.vercel.app/sign/[token]).
// Le `rendered_body` stocké = EXACTEMENT le « super layout » de la preview
// (buildContractHtmlForDocuseal_publicForPreview via resolveContractRenderInputs)
// => preview = document signé, garanti. L'employeur est pré-signé (image),
// la zone employé est un marqueur <!--EMPLOYEE_SIG--> rempli à la signature.
//
// sendContractViaDocusealAction reste en place (dormant) pour rollback.
// ===========================================================================
export async function sendContractForSignatureAction(
  args: Args,
): Promise<{ ok?: true; error?: string; signingUrl?: string; discrepancies?: ContractDiscrepancy[] }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee manquant." };
  if (!args.employerEmail || !/.+@.+\..+/.test(args.employerEmail)) {
    return { error: "Email employeur invalide." };
  }

  const admin = createAdminClient();

  // 1. Employé + langue + garde-fous
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, email, start_date, preferred_language, candidate_id, contract_type")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!empRaw) return { error: "Employé introuvable." };
  const employee = empRaw as {
    id: string;
    full_name: string;
    email: string | null;
    start_date: string | null;
    preferred_language: string | null;
    candidate_id: string | null;
    contract_type: string | null;
  };
  const lang: ContractLang =
    employee.preferred_language === "nl" || employee.preferred_language === "en"
      ? employee.preferred_language
      : "fr";

  // 1b. Garde-fou screening (identique à l'envoi DocuSeal) + bypass loggé.
  if (employee.candidate_id) {
    const { data: scr } = await admin
      .from("screening_responses")
      .select("completed_at, rh_decision_at, recommendation")
      .eq("candidate_id", employee.candidate_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (args.bypassScreening?.reason) {
      try {
        await admin.from("activity_log").insert({
          profile_id: profile.id,
          action: "contract_screening_bypassed",
          target_type: "employee",
          target_id: args.employeeId,
          body: `Bypass admin checks screening (envoi interne /sign). Raison : ${args.bypassScreening.reason}.`,
        });
      } catch {/* non bloquant */}
    } else {
      if (!scr || !scr.completed_at) {
        return { error: "⛔ Le candidat doit d'abord compléter le questionnaire de profilage (/me/screening). Envoie-lui le lien — ou utilise le bypass admin avec raison." };
      }
      if (scr.recommendation === "PASS") {
        return { error: "⛔ Le système recommande de ne PAS embaucher ce candidat (recommandation PASS). Vérifie le screening — ou bypass admin avec raison." };
      }
      if (!scr.rh_decision_at) {
        return { error: "⛔ Le screening est complet mais doit être VALIDÉ par RH avant l'envoi du contrat. Voir /rh/screening — ou bypass admin avec raison." };
      }
    }
  }

  // 1c. Règle légale : contrat signé AVANT la date de début (sinon CDI, loi 3/7/1978).
  // Dérogation admin : si date passée et role=admin, on redirige l'envoi vers son mail.
  const todayISO = new Date().toISOString().slice(0, 10);
  if (employee.start_date && employee.start_date < todayISO) {
    if (profile.role === "admin" && profile.email) {
      employee.email = profile.email;
    } else {
      return {
        error:
          `⛔ Date de début (${employee.start_date}) dans le passé. ` +
          `Un contrat non signé avant l'entrée en service devient CDI (loi 3 juillet 1978 art. 9). ` +
          `Recule la date de début ou contacte un admin.`,
      };
    }
  }
  if (!employee.email) return { error: "Email employé manquant - complète la fiche d'abord." };

  // 2. Signature employeur stockée (pré-signature) + représentant autorisé.
  const { data: sigRaw } = await admin
    .from("profiles")
    .select("signature_data_url")
    .eq("id", profile.id)
    .maybeSingle();
  const employerSignatureDataUrl =
    (sigRaw as { signature_data_url: string | null } | null)?.signature_data_url ?? null;
  const orgInfo = EMPLOYER_ORGS[args.orgKey];
  const representative = pickAuthorizedRepresentative(profile.full_name, orgInfo);

  // 3. SOURCE DE VÉRITÉ UNIQUE — mêmes inputs que la preview (WYSIWYG).
  const inputs = await resolveContractRenderInputs(admin, args.employeeId, args.templateCode);
  if (!inputs.ok) return { error: inputs.error };
  const { eff, effTpl, primarySite, templateBodyMarkdown } = inputs;

  // 3b. RÈGLE : signaler les discordances fiche<->contrat à l'opérateur AVANT
  // d'adapter. Tant qu'il n'a pas validé, on bloque l'envoi et on renvoie la liste.
  if (inputs.discrepancies.length > 0 && !args.acceptDiscrepancies) {
    return { discrepancies: inputs.discrepancies };
  }
  // 3c. Validé : on aligne la fiche employee sur le contrat (le contrat fait foi)
  // et on logge l'adaptation pour audit.
  if (inputs.discrepancies.length > 0 && args.acceptDiscrepancies) {
    const patch: Record<string, unknown> = {};
    for (const d of inputs.discrepancies) {
      if (d.field === "weekly_hours") patch.weekly_hours = Number(eff.weekly_hours);
      else if (d.field === "contract_type") patch.contract_type = String(eff.contract_type);
      else if (d.field === "job_title") patch.job_title = String(eff.job_title);
      else if (d.field === "hourly_rate") patch.hourly_rate = Number(eff.hourly_rate);
      else if (d.field === "start_date") patch.start_date = String(eff.start_date);
      else if (d.field === "end_date") patch.end_date = eff.end_date ? String(eff.end_date) : null;
      else if (d.field === "work_time_kind") patch.work_time_kind = effTpl === "employee_pt" ? "partial" : "full";
    }
    if (Object.keys(patch).length > 0) {
      await admin.from("employees").update(patch).eq("id", args.employeeId);
      try {
        await admin.from("activity_log").insert({
          profile_id: profile.id,
          action: "contract_profile_aligned",
          target_type: "employee",
          target_id: args.employeeId,
          body: `Fiche alignée sur le contrat (validé par l'opérateur). Discordances : ${inputs.discrepancies.map((d) => `${d.label} ${d.profileValue}→${d.contractValue}`).join(" ; ")}.`,
        });
      } catch {/* non bloquant */}
    }
  }

  // 4. Génère le « super layout » (employeur pré-signé), puis transforme la
  // zone signature employé en marqueur rempli à la signature.
  let html: string;
  try {
    html = await buildContractHtmlForDocuseal_publicForPreview({
      templateCode: effTpl,
      templateBodyMarkdown,
      employeeData: eff as Parameters<typeof buildContractHtmlForDocuseal_publicForPreview>[0]["employeeData"],
      employerOrg: args.orgKey,
      primarySite,
      employerSignatureDataUrl,
      employerRepresentativeOverride: representative,
    });
  } catch (e) {
    return { error: `Échec du rendu du contrat : ${(e as Error).message}` };
  }
  let renderedBody = html.replace(
    /<signature-field name="Signature employee"[^>]*><\/signature-field>/,
    "<!--EMPLOYEE_SIG-->",
  );
  // Si l'employeur n'a pas de signature stockée, neutralise son champ DocuSeal.
  renderedBody = renderedBody.replace(
    /<signature-field[^>]*><\/signature-field>/g,
    `<div style="height:50px;border-bottom:1pt dashed #555;margin:0.2cm auto;width:80%;"></div>`,
  );
  renderedBody = renderedBody.replace(
    /<date-field[^>]*><\/date-field>/g,
    `<span style="display:inline-block;min-width:100px;border-bottom:1pt dashed #555;">&nbsp;</span>`,
  );

  // 5. Token + persistance employee_contracts (rendered_body = super layout).
  const signingToken = randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  const { data: tplId } = await admin
    .from("contract_templates")
    .select("id")
    .eq("code", effTpl)
    .maybeSingle();

  const { data: row, error: insErr } = await admin
    .from("employee_contracts")
    .insert({
      employee_id: employee.id,
      full_name: employee.full_name,
      nrn: (eff.nrn as string) ?? null,
      address: (eff.address as string) ?? null,
      postal_code: (eff.postal_code as string) ?? null,
      city: (eff.city as string) ?? null,
      contract_kind: effTpl === "student" ? "Étudiant" : (employee.contract_type ?? "CDD"),
      start_date: (eff.start_date as string) ?? todayISO,
      end_date: (eff.end_date as string) ?? null,
      weekly_hours: Number(eff.weekly_hours ?? 38),
      position_title: String(eff.job_title ?? "Employé"),
      workplace: primarySite?.name ?? "Schaerbeek",
      status: "ready_to_sign",
      prepared_at: new Date().toISOString(),
      template_id: (tplId as { id: string } | null)?.id ?? null,
      signing_token: signingToken,
      signing_token_expires_at: expires.toISOString(),
      rendered_body: renderedBody,
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };
  void row;

  // 6. Mail au candidat avec le lien INTERNE (prod stable), + copie archive employeur.
  const signingUrl = `${getOutboundBaseUrl()}/sign/${signingToken}`;
  const mailRes = await sendContractSignatureMail({
    employeeName: employee.full_name,
    employeeEmail: employee.email,
    signingUrl,
    employerName: orgInfo.name,
    language: lang,
    customBody: args.customMailBody,
  });
  if (mailRes.error) console.warn("[sendContractForSignature] mail err:", mailRes.error);
  try {
    await sendEmployerCopyMail({
      employerEmail: args.employerEmail,
      employeeName: employee.full_name,
      employeeEmail: employee.email,
      signingUrl,
      employerName: orgInfo.name,
      templateLabel: effTpl,
    });
  } catch (e) {
    console.warn("[sendEmployerCopyMail] err:", (e as Error).message);
  }

  revalidatePath(`/planning/employees/${args.employeeId}`);
  revalidatePath(`/planning/employees/${args.employeeId}/contract`);
  return { ok: true, signingUrl };
}
