#!/usr/bin/env node
// Send a fake inbound email to /api/inbound/test for local testing.
// Usage :
//   node scripts/inbound-test.mjs --from foo@bar.com --subject "Re: Invitation" --text "Bonjour..."
//   node scripts/inbound-test.mjs --demo               # injects 4 sample replies matching existing candidates

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ENDPOINT = `${APP_URL}/api/inbound/test`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function postOne(payload) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: r.status, body: parsed };
}

async function runDemo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Pick 4 candidates with email
  const { data: cands } = await sb
    .from("candidates")
    .select("id, full_name, email")
    .not("email", "is", null)
    .limit(50);
  const sample = (cands ?? [])
    .filter((c) => c.email && c.email.includes("@"))
    .slice(0, 4);

  if (sample.length === 0) {
    // Fall back to one synthetic unknown sender
    sample.push({ id: null, full_name: "Inconnu Demo", email: "inconnu.demo@example.com" });
  }

  const scenarios = [
    {
      subject: "Re: Invitation à un entretien",
      text: "Bonjour,\n\nMerci pour votre invitation. Je confirme ma présence pour le créneau du mardi 14h.\n\nCordialement,",
    },
    {
      subject: "Re: Confirmation de votre candidature",
      text: "Bonjour,\n\nJe vous remercie pour votre retour. Voici mon CV à jour ci-joint.\n\nBien cordialement,",
      attachments: [
        {
          filename: "cv-demo.pdf",
          mime: "application/pdf",
          // Tiny PDF stub (just bytes, not a real document)
          content_base64: Buffer.from("%PDF-1.4\n%fake demo cv\n").toString("base64"),
        },
      ],
    },
    {
      subject: "Question sur le poste",
      text: "Bonjour,\n\nPourriez-vous me préciser les horaires de travail et la zone de Bruxelles concernée ?\n\nMerci d'avance.",
    },
    {
      subject: "Disponibilités semaine prochaine",
      text: "Bonjour,\n\nJe suis disponible lundi matin et jeudi après-midi. Quelle plage vous convient ?\n\nCordialement,",
    },
  ];

  console.log(`Posting ${sample.length} demo inbound emails to ${ENDPOINT}…`);
  for (let i = 0; i < sample.length; i++) {
    const cand = sample[i];
    const sc = scenarios[i % scenarios.length];
    const payload = {
      from: cand.full_name ? `${cand.full_name} <${cand.email}>` : cand.email,
      to: "hr@caftanfactory.com",
      subject: sc.subject,
      text: sc.text,
      attachments: sc.attachments,
    };
    try {
      const res = await postOne(payload);
      console.log(`  ${i + 1}. ${cand.email}  → ${res.status}`, JSON.stringify(res.body));
    } catch (e) {
      console.error(`  ${i + 1}. ${cand.email} FAILED:`, e.message);
    }
  }

  // One unmatched email (unknown sender) so the "à attribuer" UI has content
  console.log("Posting 1 unknown-sender email (will land in 'à attribuer')…");
  const unknown = await postOne({
    from: "Recruteur Mystère <demo-unknown@example.org>",
    to: "hr@caftanfactory.com",
    subject: "Proposition de partenariat",
    text: "Bonjour, nous proposons des services de sourcing pour CaftanRH. Pouvons-nous échanger ?",
  });
  console.log(`  → ${unknown.status}`, JSON.stringify(unknown.body));

  console.log("\nDemo done. Visit /rh/messages and /rh/messages/unmatched.");
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.demo) {
    await runDemo();
    return;
  }

  const from = args.from || "test@example.com";
  const subject = args.subject || "Test inbound";
  const text = args.text || "Bonjour, ceci est un test inbound.";
  const inReplyTo = args["in-reply-to"] || null;

  console.log(`POST ${ENDPOINT}`);
  console.log(`  from:    ${from}`);
  console.log(`  subject: ${subject}`);
  const res = await postOne({ from, subject, text, in_reply_to: inReplyTo });
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(res.body, null, 2));
}

main().catch((e) => {
  console.error("inbound-test failed:", e);
  process.exit(1);
});
