// Karim 2026-06-03 : cron mensuel anonymisation RGPD.
// Anonymise les candidates refusés ou inactifs depuis > 12 mois conformément
// à l'engagement RGPD pris dans le formulaire de candidature (max 12 mois
// de conservation après refus).
//
// Champs anonymisés :
// - full_name → "Anonyme {hash8}"
// - email → "deleted_{hash}@anonymized.local"
// - phone, nrn, address, birth_date, cin_number → NULL
// - raw_payload → cleared
// - cv_url → cleared (le fichier reste en Storage mais sans référence DB)
//
// Critères :
// - status = 'refused' ET refused_at < now - 12 mois
// - OU created_at < now - 12 mois ET pas devenu employee
// - OU status NULL et created_at < 24 mois (vieux dossiers oubliés)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hashSuffix(id: string): string {
  return crypto.createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const twentyFourMonthsAgo = new Date(Date.now() - 730 * 24 * 3600 * 1000).toISOString();

  // 1. Récupère les candidats potentiels (créés > 12 mois, pas déjà anonymisés)
  const { data: candidates } = await admin
    .from("candidates")
    .select("id, created_at, email, full_name, prevalidated")
    .lt("created_at", twelveMonthsAgo)
    .not("email", "like", "deleted_%@anonymized.local") // skip si déjà fait
    .limit(500);

  let anonymized = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of (candidates ?? []) as Array<{ id: string; created_at: string; email: string | null; full_name: string; prevalidated: boolean | null }>) {
    try {
      // Karim 2026-07-03 (audit) : NE JAMAIS anonymiser un candidat encore ACTIF.
      // Les candidates n'ont pas de colonne status -> on regarde leurs candidatures :
      // éligible UNIQUEMENT si toutes ses candidatures sont 'refused' (rétention 12 mois),
      // OU aucune candidature ET dossier abandonné > 24 mois. Jamais un pré-validé
      // (embauche en cours), jamais un lié à un employé (vérif robuste multi-lignes).
      if (c.prevalidated === true) { skipped++; continue; }

      const { data: emps } = await admin
        .from("employees")
        .select("id")
        .eq("candidate_id", c.id)
        .limit(1);
      if (emps && emps.length > 0) { skipped++; continue; }

      const { data: apps } = await admin
        .from("applications")
        .select("status")
        .eq("candidate_id", c.id);
      const appList = (apps ?? []) as Array<{ status: string | null }>;
      const eligible = appList.length > 0
        ? appList.every((a) => a.status === "refused")
        : c.created_at < twentyFourMonthsAgo;
      if (!eligible) { skipped++; continue; }

      const suf = hashSuffix(c.id);
      const { error } = await admin
        .from("candidates")
        .update({
          full_name: `Anonyme ${suf}`,
          email: `deleted_${suf}@anonymized.local`,
          phone: null,
          nrn: null,
          cin_number: null,
          address: null,
          city: null,
          postal_code: null,
          birth_date: null,
          birth_place: null,
          nationality: null,
          iban: null,
          bic: null,
          bank_holder: null,
          cv_url: null,
          raw_payload: null,
          gf_full_payload: null,
        })
        .eq("id", c.id);
      if (error) errors.push(`${c.id}: ${error.message}`);
      else anonymized++;
    } catch (e) {
      errors.push(`${c.id}: ${(e as Error).message}`);
    }
  }

  // 2. Anonymise aussi les outbound_mails associés (pour les candidats)
  let mailsAnonymized = 0;
  try {
    const { count } = await admin
      .from("outbound_mails")
      .update({
        recipient_name: "Anonyme",
        recipient_email: "deleted@anonymized.local",
        body: null,
        body_html: null,
      })
      .lt("sent_at", twelveMonthsAgo)
      .like("recipient_email", "%@%")
      .not("recipient_email", "like", "%@caftanfactory.com")
      .not("recipient_email", "like", "deleted_%@anonymized.local")
      .is("employee_id", null);  // seulement candidats, pas employees
    mailsAnonymized = count ?? 0;
  } catch (e) {
    errors.push(`mails: ${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: true,
    anonymized,
    skipped,
    mails_anonymized: mailsAnonymized,
    errors: errors.slice(0, 10),
    cutoff_12_months: twelveMonthsAgo.slice(0, 10),
    cutoff_24_months: twentyFourMonthsAgo.slice(0, 10),
  });
}
