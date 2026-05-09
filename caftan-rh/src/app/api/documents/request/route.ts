// POST /api/documents/request
// Crée un magic link upload pour un document, et (optionnellement) prépare
// un email rendu côté serveur — que le client envoie via EmailJS.
//
// Auth : RH / admin / manager.
// Body : { applicationId? | candidateId? | employeeId?, docSlug, sendEmail, ttlDays?, hint? }

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { createUploadToken } from "@/lib/documents/tokens";
import { getCatalog } from "@/lib/documents/catalog";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

type Body = {
  applicationId?: string;
  candidateId?: string;
  employeeId?: string;
  docSlug: string;
  sendEmail?: boolean;
  ttlDays?: number;
  hint?: string;
};

export async function POST(request: NextRequest) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  if (!body.docSlug) return NextResponse.json({ error: "docSlug requis." }, { status: 400 });
  if (!body.applicationId && !body.candidateId && !body.employeeId) {
    return NextResponse.json(
      { error: "applicationId, candidateId ou employeeId requis." },
      { status: 400 },
    );
  }

  const catalog = await getCatalog(body.docSlug);
  if (!catalog) {
    return NextResponse.json({ error: "Slug document inconnu." }, { status: 404 });
  }

  // Si applicationId fourni : récupère candidate_id automatiquement
  let candidateId = body.candidateId ?? null;
  let candidateEmail: string | null = null;
  let candidateName: string | null = null;
  let employeeEmail: string | null = null;
  let employeeName: string | null = null;

  if (body.applicationId) {
    const { data: app } = await supabase
      .from("applications")
      .select("id, candidate_id, candidate:candidates(email, full_name)")
      .eq("id", body.applicationId)
      .maybeSingle();
    type AppRow = {
      id: string;
      candidate_id: string;
      candidate: { email: string; full_name: string } | null;
    };
    const a = app as unknown as AppRow | null;
    if (a) {
      candidateId = a.candidate_id;
      candidateEmail = a.candidate?.email ?? null;
      candidateName = a.candidate?.full_name ?? null;
    }
  } else if (body.candidateId) {
    const { data: c } = await supabase
      .from("candidates")
      .select("email, full_name")
      .eq("id", body.candidateId)
      .maybeSingle();
    const cr = c as unknown as { email: string; full_name: string } | null;
    candidateEmail = cr?.email ?? null;
    candidateName = cr?.full_name ?? null;
  } else if (body.employeeId) {
    const { data: e } = await supabase
      .from("employees")
      .select("email, full_name")
      .eq("id", body.employeeId)
      .maybeSingle();
    const er = e as unknown as { email: string; full_name: string } | null;
    employeeEmail = er?.email ?? null;
    employeeName = er?.full_name ?? null;
  }

  // Crée le token
  const tokenResult = await createUploadToken({
    candidateId,
    employeeId: body.employeeId ?? null,
    applicationId: body.applicationId ?? null,
    docSlug: body.docSlug,
    ttlDays: body.ttlDays ?? 7,
    createdBy: profile.id,
    hint: body.hint ?? null,
  });
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.error }, { status: 500 });
  }

  await logActivity({
    kind: "document.upload_link.created",
    targetType: body.applicationId ? "application" : undefined,
    targetId: body.applicationId ?? body.candidateId ?? body.employeeId ?? null,
    description: `Magic link upload créé : ${catalog.label}`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: {
      doc_slug: body.docSlug,
      token_id: tokenResult.id,
    },
  });

  // Si sendEmail = false, on retourne juste le token / url
  if (!body.sendEmail) {
    return NextResponse.json({
      ok: true,
      tokenId: tokenResult.id,
      url: tokenResult.url,
      expiresAt: tokenResult.expiresAt,
    });
  }

  // Sinon : on prépare le rendu de l'email (client envoie via EmailJS)
  // On choisit le template : 1) catalog.default_template_slug → 2) request_document_<slug> → 3) request_document_generic
  const candidateTemplates = [
    catalog.default_template_slug,
    `request_document_${body.docSlug}`,
    "request_document_generic",
  ].filter(Boolean) as string[];

  const { data: tmpls } = await supabase
    .from("email_templates")
    .select("slug, subject, body_html")
    .in("slug", candidateTemplates)
    .eq("is_active", true);

  type Tmpl = { slug: string; subject: string; body_html: string };
  const found = (tmpls ?? []) as unknown as Tmpl[];
  const tmpl =
    candidateTemplates.map((s) => found.find((f) => f.slug === s)).find((x) => x) ?? null;

  if (!tmpl) {
    return NextResponse.json({
      ok: true,
      tokenId: tokenResult.id,
      url: tokenResult.url,
      expiresAt: tokenResult.expiresAt,
      warning:
        "Aucun template `request_document_*` trouvé. Re-lance `node scripts/seed-email-templates.mjs`.",
    });
  }

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

  const fullname = candidateName ?? employeeName ?? "";
  const vars = {
    ...orgVars,
    firstname: firstNameOf(fullname),
    fullname,
    custom: "",
    dates: "",
    times: "",
    document_label: catalog.label,
    document_upload_url: tokenResult.url,
  };
  const subject = renderTemplate(tmpl.subject, vars);
  const bodyHtml = renderTemplate(tmpl.body_html, vars);
  const toEmail = candidateEmail ?? employeeEmail ?? "";
  const toName = candidateName ?? employeeName ?? "";

  return NextResponse.json({
    ok: true,
    tokenId: tokenResult.id,
    url: tokenResult.url,
    expiresAt: tokenResult.expiresAt,
    email: {
      template_slug: tmpl.slug,
      to_email: toEmail,
      to_name: toName,
      subject,
      body: bodyHtml,
      application_id: body.applicationId ?? null,
    },
  });
}
