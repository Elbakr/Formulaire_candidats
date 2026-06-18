"use server";

// Karim 2026-05-30 : génère le HTML brut du contrat (zéro appel DocuSeal externe)
// pour preview iframe avant envoi reel.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { buildContractHtmlForDocuseal_publicForPreview } from "@/lib/docuseal-flow";
import { resolveContractRenderInputs } from "@/lib/contract-render-inputs";

export async function previewContractHtmlAction(
  employeeId: string,
  tplCode: "employee" | "employee_pt" | "student",
  options?: { manualSign?: boolean },
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  // Karim 2026-06-15 : preview = version envoyée à signer. Même source de vérité
  // (resolveContractRenderInputs) que l'envoi -> WYSIWYG garanti. Le contrat
  // préparé prime sur la fiche employee (sinon bug Sanae : fiche 38h full alors
  // que le contrat réel est 24h temps partiel).
  const inputs = await resolveContractRenderInputs(admin, employeeId, tplCode);
  if (!inputs.ok) return { ok: false, error: inputs.error };
  const { eff, effTpl, primarySite, templateBodyMarkdown } = inputs;

  // Karim 2026-05-31 : si manualSign, on FORCE pas de pre-signature stockee
  // (le contrat sera imprime pour signature manuelle)
  const employerSignatureDataUrl = options?.manualSign
    ? null
    : (
        (await admin.from("profiles").select("signature_data_url").eq("id", profile.id).maybeSingle()).data as
          | { signature_data_url: string | null }
          | null
      )?.signature_data_url ?? null;

  // Karim 2026-06-18 : entité = celle du SITE du travailleur (plus de amd_megastore
  // codé en dur). Preview = ce qui sera signé.
  const { resolveEmployerOrgForEmployee, toContractEmployerOrg } = await import("@/lib/employer-orgs");
  const orgRow = await resolveEmployerOrgForEmployee(admin, employeeId);
  const employerOrgKey = ((orgRow?.key as "amd_megastore" | "caftan_factory" | "homix") ?? "amd_megastore");

  try {
    let html = await buildContractHtmlForDocuseal_publicForPreview({
      templateCode: effTpl,
      templateBodyMarkdown,
      employeeData: eff as Parameters<typeof buildContractHtmlForDocuseal_publicForPreview>[0]["employeeData"],
      employerOrg: employerOrgKey,
      employerData: orgRow ? toContractEmployerOrg(orgRow) : undefined,
      primarySite,
      employerSignatureDataUrl,
      employerRepresentativeOverride: profile.full_name ?? "Karim Elbazi",
    });
    // Karim 2026-05-31 : mode manual sign - remplace <signature-field> et
    // <date-field> par des zones vides imprimables pour signature manuelle
    if (options?.manualSign) {
      html = html
        // Signature field -> zone vide (visible bordure pointillee)
        .replace(
          /<signature-field[^>]*><\/signature-field>/g,
          `<div style="height: 60px; border-bottom: 1pt dashed #555; margin: 0.2cm auto; width: 80%;"></div>`,
        )
        // Date field -> petit cadre vide
        .replace(
          /<date-field[^>]*><\/date-field>/g,
          `<span style="display: inline-block; min-width: 100px; border-bottom: 1pt dashed #555;">&nbsp;</span>`,
        )
        // Ajoute CSS print + cache les éléments specifique au PDF interactif
        .replace(
          "</head>",
          `<style>@media print { body { margin: 0; } @page { margin: 1.5cm 2cm; } } </style></head>`,
        );
    }
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
