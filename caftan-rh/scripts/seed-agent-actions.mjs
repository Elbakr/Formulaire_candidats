#!/usr/bin/env node
// Seed démonstration : insère 5-10 agent_actions de démo pour visualiser l'Inbox sans API key.
// Idempotent : ne ré-insère pas si proposed_by_agent='demo' a déjà au moins 5 lignes.
// Usage : `npm run seed:agent-demo`

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function makeDrafts(name, subjectHint) {
  return [
    {
      tone: "formel",
      subject: `Re: ${subjectHint}`,
      body_html: `<p>Bonjour ${name.split(" ")[0]},</p><p>Nous accusons bonne réception de votre message. Nous reviendrons vers vous sous 48 heures avec un retour détaillé.</p><p>Cordialement,<br/>L'équipe CaftanRH</p>`,
    },
    {
      tone: "chaleureux",
      subject: `Re: ${subjectHint}`,
      body_html: `<p>Bonjour ${name.split(" ")[0]},</p><p>Merci beaucoup pour votre retour ! C'est un plaisir d'avoir des candidat·e·s motivé·e·s comme vous. Je reviens vers vous très vite avec un point précis.</p><p>Belle journée,<br/>L'équipe CaftanRH</p>`,
    },
    {
      tone: "court",
      subject: `Re: ${subjectHint}`,
      body_html: `<p>Bonjour ${name.split(" ")[0]},</p><p>Bien reçu, je reviens vers vous dans 24h.</p><p>Bonne journée.</p>`,
    },
  ];
}

async function main() {
  // Idempotency check
  const { count } = await supabase
    .from("agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("proposed_by_agent", "demo");
  if ((count ?? 0) >= 5) {
    console.log(`✓ ${count} demo agent_actions déjà présentes — rien à faire.`);
    return;
  }

  // Pull a few real applications to attach demo drafts to
  const { data: apps } = await supabase
    .from("applications")
    .select("id, status, candidate:candidates(id, full_name, email), job:jobs(id, title)")
    .order("created_at", { ascending: false })
    .limit(8);

  const usableApps = (apps ?? []).filter((a) => a.candidate?.full_name);

  const rows = [];

  // 5 reply_draft demos
  usableApps.slice(0, 5).forEach((a, idx) => {
    const name = a.candidate.full_name;
    const subject = a.job?.title ? `Candidature ${a.job.title}` : "Candidature spontanée";
    rows.push({
      kind: "reply_draft",
      status: "proposed",
      payload: {
        drafts: makeDrafts(name, subject),
        last_message_in: { subject: subject, body_text: "Bonjour, avez-vous des nouvelles ?" },
      },
      target_type: "application",
      target_id: a.id,
      proposed_by_agent: "demo",
      ai_confidence: 0.6 + (idx % 4) * 0.1, // 0.6, 0.7, 0.8, 0.9, 0.6
    });
  });

  // 2 status_change demos
  usableApps.slice(0, 2).forEach((a, idx) => {
    rows.push({
      kind: "status_change",
      status: "proposed",
      payload: {
        next_status: idx === 0 ? "contacted" : "rdv_scheduled",
        reason: "L'IA détecte une réponse positive du candidat.",
      },
      target_type: "application",
      target_id: a.id,
      proposed_by_agent: "demo",
      ai_confidence: 0.85,
    });
  });

  // 1 candidate_scoring demo
  if (usableApps[0]) {
    rows.push({
      kind: "candidate_scoring",
      status: "proposed",
      payload: {
        fit_0_100: 78,
        strengths: ["Expérience retail mode", "Bilingue FR/NL", "Habite Bruxelles"],
        gaps: ["Pas d'expérience management"],
        suggested_next_stage: "rdv_scheduled",
        justification: "Profil très adapté à la boutique haut de gamme.",
      },
      target_type: "application",
      target_id: usableApps[0].id,
      proposed_by_agent: "demo",
      ai_confidence: 0.92,
    });
  }

  // 1 spam_archive demo (no real target — just illustrative)
  rows.push({
    kind: "spam_archive",
    status: "proposed",
    payload: {
      from: "noreply@spamdomain.example",
      subject: "Promotion exceptionnelle annonce LinkedIn",
      reason: "Démarchage commercial automatisé.",
    },
    target_type: null,
    target_id: null,
    proposed_by_agent: "demo",
    ai_confidence: 0.97,
  });

  // 1 follow_up demo
  if (usableApps[2]) {
    rows.push({
      kind: "follow_up",
      status: "proposed",
      payload: {
        template_slug: "relance_j5",
        reason: "Pas de réponse depuis 5 jours après accusé de réception.",
      },
      target_type: "application",
      target_id: usableApps[2].id,
      proposed_by_agent: "demo",
      ai_confidence: 0.7,
    });
  }

  if (rows.length === 0) {
    console.log("⚠ Aucune application trouvée — impossible de générer des demos contextualisées.");
    // Even with no apps, insert generic spam demo so the inbox isn't empty
    rows.push({
      kind: "spam_archive",
      status: "proposed",
      payload: { from: "noreply@spam.example", subject: "Promo", reason: "Spam" },
      target_type: null,
      target_id: null,
      proposed_by_agent: "demo",
      ai_confidence: 0.95,
    });
  }

  const { data: inserted, error } = await supabase.from("agent_actions").insert(rows).select("id, kind");
  if (error) {
    console.error("✗ Insert failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ Inserted ${inserted?.length ?? 0} demo agent_actions :`);
  (inserted ?? []).forEach((r) => console.log(`  - ${r.kind} (${r.id})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
