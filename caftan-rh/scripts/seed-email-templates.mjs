#!/usr/bin/env node
// Seed les 9 templates emails repris de l'ancien recrutement.html
// Variables: {{firstname}} {{fullname}} {{custom}} {{dates}} {{times}}
//            {{org_name}} {{org_email}} {{org_phone}} {{org_whatsapp}} {{org_address}}

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SIG = `<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Cordialement,<br><b>L'équipe RH — {{org_name}}</b><br>
📧 <a href="mailto:{{org_email}}" style="color:#1a5fa8">{{org_email}}</a><br>
💬 <a href="https://wa.me/{{org_whatsapp}}" style="color:#25D366">WhatsApp : {{org_phone}}</a></p>`;

const wrap = (content) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.8;max-width:600px">
<p style="white-space:pre-wrap;margin:0 0 8px">${content}</p>${SIG}</div>`;

const TEMPLATES = [
  {
    slug: "invite",
    label: "📅 Invitation entretien",
    category: "rdv",
    needs_dates: true,
    needs_times: true,
    subject: "Invitation à un entretien — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Nous avons bien reçu votre candidature pour un poste au sein de nos boutiques {{org_name}} et nous sommes heureux de vous informer que votre profil a retenu notre attention.

Nous souhaiterions vous rencontrer lors d'un entretien de recrutement.

📍 Lieu : {{org_address}}
📅 Dates proposées : {{dates}}
🕐 Horaires disponibles : {{times}}

Merci de confirmer votre disponibilité par retour de mail ou via WhatsApp.

{{custom}}

Nous nous réjouissons de vous rencontrer prochainement.`),
  },
  {
    slug: "invite_activa",
    label: "⭐ Invitation + Plan Activa",
    category: "rdv",
    needs_dates: true,
    needs_times: true,
    subject: "Invitation entretien & Plan Activa — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Suite à l'étude de votre candidature, nous souhaitons vous rencontrer pour un entretien chez {{org_name}}.

📍 {{org_address}}
📅 Dates : {{dates}} | 🕐 Horaires : {{times}}

⭐ INFORMATION IMPORTANTE — PLAN ACTIVA :
Votre profil correspond potentiellement aux critères du Plan Activa (dispositif de subvention à l'emploi en Région de Bruxelles-Capitale). Merci de vous munir lors de l'entretien de :
• Votre attestation d'inscription à Actiris
• Votre dernier relevé de situation

{{custom}}

Confirmez votre disponibilité par retour de mail.`),
  },
  {
    slug: "confirm_rdv",
    label: "✅ Confirmation entretien",
    category: "rdv",
    needs_dates: true,
    needs_times: true,
    subject: "Confirmation de votre entretien — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Nous confirmons votre entretien de recrutement chez {{org_name}} :

📅 Date : {{dates}}
🕐 Heure : {{times}}
📍 Lieu : {{org_address}}

Merci de vous munir de votre CIN et CV. En cas d'empêchement, contactez-nous le plus tôt possible.

{{custom}}`),
  },
  {
    slug: "relance",
    label: "🔔 Relance candidature",
    category: "info",
    subject: "Rappel — Votre candidature chez {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Nous revenons vers vous concernant votre candidature déposée auprès de {{org_name}}.

Êtes-vous toujours à la recherche d'un emploi ? Votre profil nous intéresse.

{{custom}}

N'hésitez pas à nous contacter pour convenir d'un rendez-vous.`),
  },
  {
    slug: "refuse_positive",
    label: "🚫 Refus positif",
    category: "decision",
    subject: "Votre candidature chez {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Nous vous remercions de l'intérêt que vous portez à {{org_name}} et du temps consacré à votre candidature.

Après examen attentif, nous ne pouvons malheureusement pas donner suite à votre candidature dans l'immédiat. Cette décision ne remet pas en question vos qualités.

{{custom}}

Nous conservons votre dossier et vous recontacterons si une opportunité se présente.

Nous vous souhaitons le meilleur dans votre recherche.`),
  },
  {
    slug: "waitlist",
    label: "⏳ Liste d'attente",
    category: "decision",
    subject: "Votre candidature — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Nous avons étudié votre candidature avec intérêt. Votre profil nous intéresse mais nos besoins actuels ne nous permettent pas de vous accueillir immédiatement.

Nous vous plaçons sur notre liste de réserve prioritaire et vous contacterons dès qu'un poste se libère.

{{custom}}

Merci de votre patience.`),
  },
  {
    slug: "hired",
    label: "🎉 Félicitations — Engagement",
    category: "decision",
    needs_dates: true,
    needs_times: true,
    subject: "Bienvenue chez {{org_name}} !",
    body_html: wrap(`Chèr(e) {{firstname}},

🎉 Nous avons le plaisir de vous informer que votre candidature a été retenue et que nous souhaitons vous accueillir au sein de l'équipe {{org_name}} !

📅 Prise de poste : {{dates}}
🕐 Heure : {{times}}
📍 {{org_address}}

Nous vous contacterons pour les détails pratiques (documents, formation, équipements).

{{custom}}

Bienvenue dans l'équipe — nous nous réjouissons de vous compter parmi nous !`),
  },
  {
    slug: "docrequest",
    label: "📋 Demande documents",
    category: "info",
    subject: "Documents requis — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

Afin de finaliser votre dossier de candidature chez {{org_name}}, nous vous demandons de nous faire parvenir les documents suivants :

• Copie recto/verso de votre carte d'identité
• Votre numéro de registre national (11 chiffres)
• Votre IBAN bancaire
• Votre CV à jour

{{custom}}

Merci de nous les envoyer par email à {{org_email}} ou via WhatsApp.`),
  },
  {
    slug: "dispo_urgente",
    label: "⚡ Disponibilité urgente",
    category: "rdv",
    needs_dates: true,
    needs_times: true,
    subject: "Offre d'emploi urgente — {{org_name}}",
    body_html: wrap(`Chèr(e) {{firstname}},

⚡ Nous avons un besoin urgent de personnel dans nos boutiques {{org_name}}.

📅 Poste disponible : {{dates}}
🕐 Horaire : {{times}}
📍 {{org_address}}

Êtes-vous disponible ? Contactez-nous immédiatement !

{{custom}}`),
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const { error } = await supabase
      .from("email_templates")
      .upsert(t, { onConflict: "slug" });
    if (error) {
      console.error(`✗ ${t.slug}:`, error.message);
    } else {
      console.log(`✓ ${t.slug} (${t.label})`);
    }
  }
  console.log(`\nDone. ${TEMPLATES.length} templates seeded.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
