"use server";

// Karim 2026-05-30 : génère le HTML brut du contrat (zéro appel DocuSeal externe)
// pour preview iframe avant envoi reel.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { buildContractHtmlForDocuseal_publicForPreview } from "@/lib/docuseal-flow";

export async function previewContractHtmlAction(
  employeeId: string,
  tplCode: "employee" | "employee_pt" | "student",
  options?: { manualSign?: boolean },
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .single();
  if (!emp) return { ok: false, error: "Employee introuvable" };

  // Karim 2026-06-15 : la PREVIEW doit refléter le CONTRAT PRÉPARÉ
  // (employee_contracts), pas la fiche `employees` qui reste souvent en valeurs
  // par défaut (full / 38h). Bug Sanae : fiche=38h full -> template temps plein,
  // alors que son contrat = 24h temps partiel. On charge le dernier contrat
  // préparé et on en dérive le template + les conditions réelles.
  const { data: ctrRaw } = await admin
    .from("employee_contracts")
    .select("contract_kind, weekly_hours, start_date, end_date, position_title, gross_hourly_rate, nrn, address, postal_code, city, workplace, workplace_address")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctr = ctrRaw as Record<string, unknown> | null;

  // Données effectives : contrat préparé prioritaire, fiche employee en repli.
  const eff: Record<string, unknown> = { ...(emp as Record<string, unknown>) };
  let effTpl: "employee" | "employee_pt" | "student" = tplCode;
  if (ctr) {
    const merge = (ck: string, ek: string) => { if (ctr[ck] != null && ctr[ck] !== "") eff[ek] = ctr[ck]; };
    merge("weekly_hours", "weekly_hours");
    merge("contract_kind", "contract_type");
    merge("start_date", "start_date");
    merge("end_date", "end_date");
    merge("position_title", "job_title");
    merge("gross_hourly_rate", "hourly_rate");
    merge("nrn", "nrn"); merge("address", "address"); merge("postal_code", "postal_code"); merge("city", "city");
    // Template dérivé du contrat réel (jamais du param/fiche défaillants).
    const wh = Number(eff.weekly_hours ?? 0);
    const ck = String(eff.contract_type ?? "").toLowerCase();
    effTpl = ck.includes("étud") || ck.includes("etud") ? "student"
      : (wh > 0 && wh < 38) ? "employee_pt" : "employee";
  }
  // Lieu de travail depuis le contrat si dispo (sinon fallback adresse employeur).
  const primarySite = ctr?.workplace
    ? { code: "", name: String(ctr.workplace), address: ctr.workplace_address ? String(ctr.workplace_address) : null, city: null }
    : null;

  const { data: tpl } = await admin
    .from("contract_templates")
    .select("body_markdown")
    .eq("code", effTpl)
    .single();
  if (!tpl) return { ok: false, error: "Template introuvable" };

  // Karim 2026-05-31 : si manualSign, on FORCE pas de pre-signature stockee
  // (le contrat sera imprime pour signature manuelle)
  const employerSignatureDataUrl = options?.manualSign
    ? null
    : (
        (await admin.from("profiles").select("signature_data_url").eq("id", profile.id).maybeSingle()).data as
          | { signature_data_url: string | null }
          | null
      )?.signature_data_url ?? null;

  try {
    let html = await buildContractHtmlForDocuseal_publicForPreview({
      templateCode: effTpl,
      templateBodyMarkdown: tpl.body_markdown,
      employeeData: eff as Parameters<typeof buildContractHtmlForDocuseal_publicForPreview>[0]["employeeData"],
      employerOrg: "amd_megastore",
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
