"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { createUploadToken, revokeToken } from "@/lib/documents/tokens";
import { getCatalog, type CatalogItem } from "@/lib/documents/catalog";
import { computeMissingDocs } from "@/lib/documents/missing";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity";

export type PreparedDocEmail = {
  application_id: string | null;
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
  doc_slug: string;
  doc_label: string;
  token_id: string;
  upload_url: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Demande UN document à un candidat (via applicationId)
// ────────────────────────────────────────────────────────────────────────────
export async function requestDocumentAction(
  applicationId: string,
  docSlug: string,
  sendEmail: boolean,
): Promise<{ ok: true; email?: PreparedDocEmail; tokenId: string; url: string } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  if (!applicationId || !docSlug) return { error: "applicationId + docSlug requis." };

  const catalog = await getCatalog(docSlug);
  if (!catalog) return { error: "Slug document inconnu." };

  // Récupère candidat depuis l'application
  const { data: app } = await supabase
    .from("applications")
    .select("id, candidate_id, candidate:candidates(email, full_name)")
    .eq("id", applicationId)
    .maybeSingle();
  type AppRow = {
    id: string;
    candidate_id: string;
    candidate: { email: string; full_name: string } | null;
  };
  const a = app as unknown as AppRow | null;
  if (!a?.candidate?.email) return { error: "Candidat introuvable ou sans email." };

  const tokenResult = await createUploadToken({
    candidateId: a.candidate_id,
    applicationId: a.id,
    docSlug,
    ttlDays: 7,
    createdBy: profile.id,
  });
  if (!tokenResult.ok) return { error: tokenResult.error };

  await logActivity({
    kind: "document.upload_link.created",
    targetType: "application",
    targetId: applicationId,
    description: `Magic link upload créé : ${catalog.label}`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: { doc_slug: docSlug, token_id: tokenResult.id },
  });

  revalidatePath(`/rh/candidates/${applicationId}`);

  if (!sendEmail) {
    return { ok: true, tokenId: tokenResult.id, url: tokenResult.url };
  }

  const email = await renderRequestEmail({
    catalog,
    toEmail: a.candidate.email,
    toName: a.candidate.full_name,
    applicationId: a.id,
    tokenId: tokenResult.id,
    uploadUrl: tokenResult.url,
  });
  if (!email) {
    return {
      ok: true,
      tokenId: tokenResult.id,
      url: tokenResult.url,
    };
  }
  return { ok: true, tokenId: tokenResult.id, url: tokenResult.url, email };
}

// ────────────────────────────────────────────────────────────────────────────
// Demande TOUS les documents manquants (renvoie une liste d'emails à envoyer)
// ────────────────────────────────────────────────────────────────────────────
export async function bulkRequestMissingDocsAction(
  applicationId: string,
): Promise<{ ok: true; emails: PreparedDocEmail[]; created: number } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: app } = await supabase
    .from("applications")
    .select("id, candidate_id, candidate:candidates(email, full_name)")
    .eq("id", applicationId)
    .maybeSingle();
  type AppRow = {
    id: string;
    candidate_id: string;
    candidate: { email: string; full_name: string } | null;
  };
  const a = app as unknown as AppRow | null;
  if (!a?.candidate?.email) return { error: "Candidat introuvable ou sans email." };

  const missing = await computeMissingDocs({ applicationId, candidateId: a.candidate_id });
  // Ne garde que ceux sans fichier accepté ET sans token actif
  const todo = missing.filter((m) => !m.hasFile && !m.has_pending_token);

  const emails: PreparedDocEmail[] = [];
  let created = 0;
  for (const m of todo) {
    const catalog = await getCatalog(m.slug);
    if (!catalog) continue;
    const tokenResult = await createUploadToken({
      candidateId: a.candidate_id,
      applicationId: a.id,
      docSlug: m.slug,
      ttlDays: 7,
      createdBy: profile.id,
    });
    if (!tokenResult.ok) continue;
    created += 1;

    await logActivity({
      kind: "document.upload_link.created",
      targetType: "application",
      targetId: applicationId,
      description: `Magic link upload créé : ${catalog.label}`.slice(0, 200),
      actorId: profile.id,
      actorLabel: profile.full_name ?? profile.email ?? null,
      data: { doc_slug: m.slug, token_id: tokenResult.id, bulk: true },
    });

    const email = await renderRequestEmail({
      catalog,
      toEmail: a.candidate.email,
      toName: a.candidate.full_name,
      applicationId: a.id,
      tokenId: tokenResult.id,
      uploadUrl: tokenResult.url,
    });
    if (email) emails.push(email);
  }

  revalidatePath(`/rh/candidates/${applicationId}`);
  return { ok: true, emails, created };
}

// ────────────────────────────────────────────────────────────────────────────
// Validation d'un document (accept/reject), avec auto-check onboarding
// ────────────────────────────────────────────────────────────────────────────
export async function validateDocumentAction(
  documentId: string,
  accepted: boolean,
  rejectionReason?: string,
): Promise<{ ok: true; onboardingItemDone?: boolean } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!accepted && !rejectionReason) {
    return { error: "Motif de rejet requis." };
  }

  const { data: docRow } = await supabase
    .from("documents")
    .select("id, catalog_slug, candidate_id, employee_id, application_id, file_name")
    .eq("id", documentId)
    .maybeSingle();
  type DocRow = {
    id: string;
    catalog_slug: string | null;
    candidate_id: string | null;
    employee_id: string | null;
    application_id: string | null;
    file_name: string;
  };
  const doc = docRow as unknown as DocRow | null;
  if (!doc) return { error: "Document introuvable." };

  const update = {
    validation_status: accepted ? "accepted" : "rejected",
    validated_by: profile.id,
    validated_at: new Date().toISOString(),
    rejection_reason: accepted ? null : (rejectionReason ?? null),
  };
  const { error: upErr } = await supabase.from("documents").update(update).eq("id", documentId);
  if (upErr) return { error: upErr.message };

  await logActivity({
    kind: accepted ? "document.validated" : "document.rejected",
    targetType: doc.application_id ? "application" : doc.employee_id ? "employee" : "candidate",
    targetId: doc.application_id ?? doc.employee_id ?? doc.candidate_id ?? null,
    description: accepted
      ? `Document accepté : ${doc.file_name}`
      : `Document rejeté : ${doc.file_name} (${rejectionReason ?? "?"})`,
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: { document_id: doc.id, doc_slug: doc.catalog_slug, accepted, rejection_reason: rejectionReason ?? null },
  });

  // Auto-check onboarding item si on a accepté ET qu'on connaît un employee_id
  // (ou si l'application liée a un employee).
  let onboardingItemDone = false;
  if (accepted && doc.catalog_slug) {
    const catalog = await getCatalog(doc.catalog_slug);
    if (catalog) {
      let employeeId: string | null = doc.employee_id;
      if (!employeeId && doc.application_id) {
        const { data: emp } = await admin
          .from("employees")
          .select("id")
          .eq("application_id", doc.application_id)
          .maybeSingle();
        const e = emp as unknown as { id: string } | null;
        if (e) employeeId = e.id;
      }
      if (!employeeId && doc.candidate_id) {
        const { data: emp } = await admin
          .from("employees")
          .select("id")
          .eq("candidate_id", doc.candidate_id)
          .maybeSingle();
        const e = emp as unknown as { id: string } | null;
        if (e) employeeId = e.id;
      }
      if (employeeId) {
        onboardingItemDone = await maybeMarkOnboardingDone(employeeId, catalog, profile.id);
      }
    }
  }

  if (doc.application_id) revalidatePath(`/rh/candidates/${doc.application_id}`);
  return { ok: true, onboardingItemDone };
}

// ────────────────────────────────────────────────────────────────────────────
// Révocation d'un token
// ────────────────────────────────────────────────────────────────────────────
export async function revokeTokenAction(tokenId: string): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!tokenId) return { error: "tokenId requis." };

  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("document_upload_tokens")
    .select("id, application_id, candidate_id, employee_id, doc_slug")
    .eq("id", tokenId)
    .maybeSingle();
  type T = {
    id: string;
    application_id: string | null;
    candidate_id: string | null;
    employee_id: string | null;
    doc_slug: string | null;
  };
  const t = tokenRow as unknown as T | null;
  if (!t) return { error: "Token introuvable." };

  await revokeToken(tokenId);
  await logActivity({
    kind: "document.upload_link.revoked",
    targetType: t.application_id ? "application" : undefined,
    targetId: t.application_id ?? t.candidate_id ?? t.employee_id ?? null,
    description: "Magic link upload révoqué.",
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: { token_id: tokenId, doc_slug: t.doc_slug },
  });
  if (t.application_id) revalidatePath(`/rh/candidates/${t.application_id}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
async function renderRequestEmail(args: {
  catalog: CatalogItem;
  toEmail: string;
  toName: string;
  applicationId: string | null;
  tokenId: string;
  uploadUrl: string;
}): Promise<PreparedDocEmail | null> {
  const supabase = await createClient();
  const candidates = [
    args.catalog.default_template_slug,
    `request_document_${args.catalog.slug}`,
    "request_document_generic",
  ].filter(Boolean) as string[];

  const { data: tmpls } = await supabase
    .from("email_templates")
    .select("slug, subject, body_html")
    .in("slug", candidates)
    .eq("is_active", true);
  type Tmpl = { slug: string; subject: string; body_html: string };
  const found = (tmpls ?? []) as unknown as Tmpl[];
  const tmpl = candidates.map((s) => found.find((f) => f.slug === s)).find((x) => x);
  if (!tmpl) return null;

  const { data: org } = await supabase
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp, org_address")
    .eq("id", 1)
    .single();
  const orgVars: OrgVars = {
    org_name: (org as { org_name?: string } | null)?.org_name ?? "Caftan Factory",
    org_email: (org as { org_email?: string } | null)?.org_email ?? "hr@caftanfactory.com",
    org_phone: (org as { org_phone?: string } | null)?.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: (org as { org_whatsapp?: string } | null)?.org_whatsapp ?? "32468596100",
    org_address:
      (org as { org_address?: string } | null)?.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };
  const vars = {
    ...orgVars,
    firstname: firstNameOf(args.toName),
    fullname: args.toName,
    custom: "",
    dates: "",
    times: "",
    document_label: args.catalog.label,
    document_upload_url: args.uploadUrl,
  };
  return {
    application_id: args.applicationId,
    to_email: args.toEmail,
    to_name: args.toName,
    subject: renderTemplate(tmpl.subject, vars),
    body: renderTemplate(tmpl.body_html, vars),
    doc_slug: args.catalog.slug,
    doc_label: args.catalog.label,
    token_id: args.tokenId,
    upload_url: args.uploadUrl,
  };
}

/** Tente de cocher un item onboarding dont le label contient (case-insensitive) le label catalogue. */
async function maybeMarkOnboardingDone(
  employeeId: string,
  catalog: CatalogItem,
  profileId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  // Récupère le run de cet employé (il y en a un seul, contrainte unique sur employee_id)
  const { data: run } = await admin
    .from("onboarding_runs")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  const r = run as unknown as { id: string } | null;
  if (!r) return false;

  // Cherche un item dont le label contient le label catalogue (case-insensitive)
  // et qui n'est pas déjà done.
  const { data: items } = await admin
    .from("onboarding_run_items")
    .select("id, label, done_at")
    .eq("run_id", r.id)
    .is("done_at", null);
  type ItemRow = { id: string; label: string; done_at: string | null };
  const arr = (items ?? []) as unknown as ItemRow[];
  const needle = catalog.label.toLowerCase();
  const match = arr.find((it) => it.label.toLowerCase().includes(needle));
  // Heuristique de fallback : pour quelques slugs, on cherche par mot-clé
  const fallbackKeywords: Record<string, string[]> = {
    id_card_front: ["carte", "identité", "ci"],
    id_card_back: ["carte", "identité", "ci"],
    iban: ["iban"],
    nrn_proof: ["nrn", "registre"],
    contract_signed: ["contrat"],
    dimona_proof: ["dimona"],
    mutuelle_certificate: ["mutuelle"],
    medical_certificate: ["médical", "medical"],
    family_allowance_caisse: ["caisse", "allocation"],
  };
  const fallbackMatch =
    !match &&
    fallbackKeywords[catalog.slug]?.some((kw) =>
      arr.some((it) => it.label.toLowerCase().includes(kw)),
    )
      ? arr.find((it) =>
          fallbackKeywords[catalog.slug].some((kw) => it.label.toLowerCase().includes(kw)),
        )
      : null;
  const target = match ?? fallbackMatch;
  if (!target) return false;

  const { error } = await admin
    .from("onboarding_run_items")
    .update({ done_at: new Date().toISOString(), done_by: profileId })
    .eq("id", target.id);
  if (error) return false;

  await logActivity({
    kind: "onboarding.item.auto_checked",
    targetType: "employee",
    targetId: employeeId,
    description: `Item onboarding coché auto : ${target.label}`.slice(0, 200),
    actorId: profileId,
    data: { item_id: target.id, doc_slug: catalog.slug },
  });
  return true;
}
