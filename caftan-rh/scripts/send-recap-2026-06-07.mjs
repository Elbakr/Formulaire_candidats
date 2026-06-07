#!/usr/bin/env node
// Karim 2026-06-07 : recap deploy Vercel prod + taches en attente.
// FR uniquement (test distant Karim). Resend via API key.
// Usage : cd caftan-rh && node scripts/send-recap-2026-06-07.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) {
    console.error("Pas de .env.local");
    process.exit(1);
  }
  const txt = readFileSync(path, "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const RESEND_KEY = env.RESEND_API_KEY;
const RESEND_FROM = env.RESEND_FROM_EMAIL ?? "Caftan Factory <onboarding@resend.dev>";

if (!RESEND_KEY) {
  console.error("RESEND_API_KEY manquant");
  process.exit(1);
}

const PROD_URL = "https://caftan-rh.vercel.app";
const TO = "elbazikarim@gmail.com";

const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;">

<h1 style="color: #0f172a; border-bottom: 2px solid #d4af37; padding-bottom: 8px; font-size: 22px;">Caftan HR — prod Vercel en ligne ✅</h1>

<p style="font-size: 16px;">Salut Karim,</p>

<p>La prod Vercel est rétablie et accessible à distance. Tu peux tester via :</p>

<div style="background: #f0fdf4; border: 1px solid #86efac; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <strong>🌐 URL prod stable :</strong><br>
  <a href="${PROD_URL}" style="font-size: 18px; color: #15803d; text-decoration: none; font-weight: 600;">${PROD_URL}</a><br>
  <span style="font-size: 13px; color: #166534;">Alias permanent — pas une URL jetable. Bookmark-able.</span>
</div>

<p><strong>Tests rapides recommandés :</strong></p>
<ul>
  <li><a href="${PROD_URL}/login">${PROD_URL}/login</a> — page de login (formulaire email confirmé OK)</li>
  <li><a href="${PROD_URL}/">${PROD_URL}/</a> — accueil (titre "CaftanRH — Recrutement")</li>
  <li>Connecte-toi avec ton compte habituel et vérifie que les modules /rh/* chargent</li>
</ul>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Ce qui a été fait cette session</h2>

<ol>
  <li><strong>Diagnostic du build Vercel cassé</strong> — 4 déploys hier en Error. Cause : 2 fichiers source jamais commités dans git, perdus :
    <ul>
      <li><code>src/app/rh/trainings/actions.ts</code> (Server Action formations, feature PR #110)</li>
      <li><code>src/app/chat-ai/chat-client.tsx</code> (Chat AI Anthropic Claude, feature PR #104)</li>
    </ul>
    Pas dans une branche, pas dans le zip backup, pas dans le reflog. Vraiment perdus.
  </li>
  <li><strong>Stubs temporaires créés</strong> pour débloquer le build :
    <ul>
      <li><code>actions.ts</code> : retourne <code>{ ok: false, error: "Module formations en reconstruction" }</code> — l'UI affichera un toast d'erreur clair si tu cliques "Ajouter formation". Le reste de <code>/rh/trainings</code> (liste, expirations) marche.</li>
      <li><code>chat-client.tsx</code> : affiche un message bilingue FR/NL "Module en reconstruction" sur <code>/chat-ai</code>.</li>
    </ul>
  </li>
  <li><strong>Fix annexe</strong> : retrait de <code>eslint: { ignoreDuringBuilds: true }</code> dans <code>next.config.ts</code> (option dépréciée en Next 16, générait un warning).</li>
  <li><strong>Redeploy Vercel</strong> via <code>scripts/vercel-deploy-quick.mjs</code> → status <code>READY</code> en ~2 min.</li>
</ol>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Tâches en attente — décisions à prendre</h2>

<p style="color: #64748b; font-style: italic;">Pour chaque tâche : pourquoi elle existe, et comment je propose de la traiter. Tu valides, j'exécute à ton retour.</p>

<h3 style="color: #b45309; font-size: 16px; margin-top: 24px;">1. Reconstruire <code>actions.ts</code> (formations) — priorité MOYENNE</h3>
<p><strong>Pourquoi :</strong> la feature "Ajouter formation" est cassée (stub). C'est une feature de la PR #110 (formations + certifications + alertes expiration) que tu as déjà testée et qui marchait.</p>
<p><strong>Comment :</strong> j'ai le contrat précis depuis le code appelant <code>add-training-button.tsx</code> (signature complète, types des params, format de retour). Je peux reconstruire en ~30 min avec :
  <br>• insert dans la table <code>employee_trainings</code> (à vérifier dans les migrations Supabase)
  <br>• upload du certificat en base64 vers le bucket Supabase Storage
  <br>• revalidatePath pour rafraîchir la liste
</p>
<p><strong>Risque :</strong> faible — je connais le schéma cible.</p>

<h3 style="color: #b45309; font-size: 16px; margin-top: 24px;">2. Reconstruire <code>chat-client.tsx</code> (Chat AI Claude) — priorité MOYENNE</h3>
<p><strong>Pourquoi :</strong> la page <code>/chat-ai</code> est aujourd'hui un stub. C'était l'assistant RH Anthropic Claude pour les employés (PR #104).</p>
<p><strong>Comment :</strong> j'ai besoin de tes inputs avant de reconstruire :
  <ul>
    <li>Quel modèle Claude utilisé (Sonnet 4.6 ? Haiku 4.5 ?)</li>
    <li>Prompt système (rôle assistant RH, périmètre, ton FR/NL, refus de répondre hors-sujet ?)</li>
    <li>Historique : conversation persistée en DB (table <code>chat_messages</code> ?) ou éphémère par session ?</li>
    <li>Streaming ou réponse complète ?</li>
    <li>Quels droits d'accès — tous les employés ou rôles spécifiques ?</li>
  </ul>
</p>
<p><strong>Risque :</strong> élevé si je reconstruis à l'aveugle — risque fort de produire du code qui ne correspond pas à ta vision originale.</p>

<h3 style="color: #b45309; font-size: 16px; margin-top: 24px;">3. Câbler le journal <code>outbound_mails</code> — priorité HAUTE</h3>
<p><strong>Pourquoi :</strong> tu as créé la migration <code>20260620000720_outbound_mails_log.sql</code> (datée "Karim 2026-05-31") avec RLS RH-only — l'intention est claire : tracer chaque mail sortant pour debug/audit ("qui a reçu quoi quand"). Aujourd'hui zéro mail n'est tracé.</p>
<p><strong>Comment :</strong>
  <ul>
    <li>Appliquer la migration sur la Supabase distante (à confirmer si déjà fait)</li>
    <li>Créer <code>src/lib/outbound-mails-log.ts</code> avec helper <code>logOutboundMail({...})</code> best-effort (n'échoue jamais l'envoi)</li>
    <li>Câbler dans les 3 helpers :
      <ul>
        <li><code>src/lib/emails.ts</code> → <code>sendEmail()</code> + 4 wrappers (acknowledgement, invite, rejection, offer)</li>
        <li><code>src/lib/emailjs-client.ts</code> → <code>sendEmailViaEmailJS()</code></li>
        <li><code>src/lib/mail-with-attachments.ts</code> → <code>sendMailWithAttachments()</code> (3 paths : Resend, SMTP Gmail, EmailJS)</li>
      </ul>
    </li>
    <li>Optionnel : UI <code>/rh/mails</code> de consultation du journal (je vois que la route existe déjà dans le build — à vérifier)</li>
  </ul>
</p>
<p><strong>Risque :</strong> très faible. Helper best-effort, signatures existantes préservées.</p>

<h3 style="color: #b45309; font-size: 16px; margin-top: 24px;">4. Rebrancher les 33 crons via cron-job.org — priorité HAUTE</h3>
<p><strong>Pourquoi :</strong> tu as retiré les crons de <code>vercel.json</code> (limite Hobby) et sauvegardé la liste dans <code>vercel-crons-backup.json</code>. Tant qu'ils ne sont pas rebranchés ailleurs, plus rien ne tourne en auto-pilote : sync Gravity Forms, scoring candidats, IMAP polling, anomaly scan, digest, leave balance, RGPD anonymize, etc. — toute la couche "plateforme auto-pilotée" de la spec est désactivée.</p>
<p><strong>Comment :</strong> ma recommandation = <strong>cron-job.org</strong> (gratuit, UE/RGPD, précision minute, l'auth Bearer CRON_SECRET est déjà en place dans les routes). Étapes :
  <ul>
    <li>Compte cron-job.org (gratuit, jusqu'à 50 jobs)</li>
    <li>Pour chaque entrée du backup : créer un job HTTP GET <code>${PROD_URL}/api/cron/&lt;path&gt;</code> avec header <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code> et la même cron expression</li>
    <li>Je peux écrire un script qui génère les 33 jobs via leur API (token API à créer dans leur UI)</li>
  </ul>
</p>
<p><strong>Alternatives écartées :</strong> Vercel Pro ($20/mois — disproportionné) ; GitHub Actions (précision sub-5min non garantie, plusieurs crons sont <code>*/5</code> ou <code>* * * * *</code>) ; Supabase pg_cron (oblige à réécrire les endpoints en SQL, la plupart font du Next.js et appellent Anthropic).</p>
<p><strong>Risque :</strong> faible. Dépendance externe au service cron-job.org — acceptable pour un déclencheur HTTP.</p>

<h3 style="color: #6b7280; font-size: 16px; margin-top: 24px;">5. Nettoyer les ~15 erreurs TS pré-existantes — priorité BASSE</h3>
<p><strong>Pourquoi :</strong> aujourd'hui <code>next.config.ts</code> a <code>typescript: { ignoreBuildErrors: true }</code>. C'est une dette : si on introduit une vraie erreur TS, on ne la verra plus au build. ~15 erreurs liées aux types Supabase générés + props lucide-react.</p>
<p><strong>Comment :</strong> faire <code>npm run build</code> en local sans <code>ignoreBuildErrors</code>, lister les erreurs, les fixer une par une. Probablement 1-2h.</p>
<p><strong>Risque :</strong> nul. Pas d'effet utilisateur.</p>

<h3 style="color: #6b7280; font-size: 16px; margin-top: 24px;">6. Dompter <code>tunnel-keeper.ps1</code> — priorité BASSE</h3>
<p><strong>Pourquoi :</strong> le script publie un commit Cloudflare toutes les ~1 min sur <code>caftan-rh-v2-prod</code> (33 commits en 40 min observés dans le reflog). Maintenant que Vercel prod est en ligne, ce système de tunnels tournants n'est plus nécessaire pour l'accès distant (l'URL <code>caftan-rh.vercel.app</code> est stable).</p>
<p><strong>Comment :</strong> 3 options à trancher :
  <ul>
    <li>(a) Arrêter complètement <code>tunnel-keeper.ps1</code> — Vercel prod suffit</li>
    <li>(b) Garder pour le dev local (HMR via tunnel pour tests mobiles) mais désactiver le push git auto — historique propre</li>
    <li>(c) Le garder tel quel comme filet de sécurité si Vercel tombe</li>
  </ul>
</p>
<p><strong>Risque :</strong> nul.</p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">État du dépôt</h2>

<p>Modifications locales non encore committées (en attente de ta validation pour push) :</p>
<ul>
  <li><code>src/app/rh/trainings/actions.ts</code> (nouveau, stub)</li>
  <li><code>src/app/chat-ai/chat-client.tsx</code> (nouveau, stub)</li>
  <li><code>next.config.ts</code> (retrait <code>eslint.ignoreDuringBuilds</code>)</li>
  <li><code>vercel.json</code>, <code>.gitignore</code> (tes modifs d'hier, non committées)</li>
  <li><code>supabase/migrations/20260620000720_outbound_mails_log.sql</code> (nouveau, datée 2026-05-31)</li>
  <li><code>vercel-crons-backup.json</code> (nouveau)</li>
  <li>5 scripts <code>send-recap-*</code> / <code>test-magic-link</code> / <code>vercel-deploy*</code> (nouveaux, utilitaires datés)</li>
  <li><code>scripts/send-recap-2026-06-07.mjs</code> (nouveau, ce script)</li>
</ul>

<p>Branche : <code>caftan-rh-v2-prod</code>. Je n'ai rien pushé sur git pour l'instant — j'attends ton retour pour commit groupé propre.</p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Prochaines actions de ta part</h2>

<ol>
  <li><strong>Tester l'URL</strong> : <a href="${PROD_URL}">${PROD_URL}</a> — confirme-moi que login et navigation marchent.</li>
  <li><strong>Choisir l'ordre des tâches 1-6</strong> : reconstruction features (1, 2) vs câblage outbound_mails (3) vs crons (4). Ma reco : 3 puis 4 d'abord (haute priorité, peu risquées), puis 1 (formations, faisable), puis discussion sur 2 (chat AI, besoin de tes inputs).</li>
  <li><strong>Pour la tâche 2 (chat AI)</strong> : si tu peux répondre aux 5 questions de la section "Comment", je peux la reconstruire fidèlement.</li>
  <li><strong>Commits</strong> : valider que je peux commit les changements non pushés (groupé : <code>chore: stubs + fix build Vercel + scripts deploy</code>).</li>
</ol>

<p style="margin-top: 32px; color: #64748b; font-style: italic; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
Envoyé automatiquement depuis Claude Code après le déploiement Vercel.<br>
Inspector du build : <a href="https://vercel.com/karl-kani-s-projects/caftan-rh/5aSYCWkB3sxBC9fSZdebAKG5s7fL">vercel.com/karl-kani-s-projects/caftan-rh/5aSYCWkB3sxBC9fSZdebAKG5s7fL</a>
</p>

</body></html>`;

const text = `Caftan HR — prod Vercel en ligne ✅

URL prod stable : ${PROD_URL}
(alias permanent, bookmark-able)

Tests rapides :
- ${PROD_URL}/login
- ${PROD_URL}/

CE QUI A ÉTÉ FAIT :
1. Diagnostic build Vercel cassé (4 déploys en Error hier)
2. Cause : 2 fichiers perdus (jamais commités) :
   - src/app/rh/trainings/actions.ts (PR #110)
   - src/app/chat-ai/chat-client.tsx (PR #104)
3. Stubs temporaires créés pour débloquer le build
4. Retrait eslint.ignoreDuringBuilds (déprécié Next 16)
5. Redeploy Vercel → status READY

TÂCHES EN ATTENTE (détails dans le HTML) :
1. Reconstruire actions.ts (formations) — moyenne
2. Reconstruire chat-client.tsx (chat AI) — moyenne, besoin d'inputs
3. Câbler journal outbound_mails — HAUTE
4. Rebrancher 33 crons via cron-job.org — HAUTE
5. Nettoyer ~15 erreurs TS — basse
6. Dompter tunnel-keeper.ps1 — basse

Modifications locales non committées : voir HTML.
Branche : caftan-rh-v2-prod.

— Claude`;

const SUBJECT = "[Caftan HR] Prod Vercel en ligne ✅ — récap & tâches en attente";

async function tryResend() {
  console.log(`[1/2] Tentative Resend vers ${TO}...`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM, to: [TO], subject: SUBJECT, text, html,
      reply_to: "hr@caftanfactory.com",
    }),
  });
  if (res.ok) {
    const data = await res.json();
    console.log(`✅ Resend OK. messageId: ${data.id}`);
    return true;
  }
  const errTxt = await res.text();
  console.warn(`Resend KO (HTTP ${res.status}): ${errTxt.slice(0, 200)}`);
  return false;
}

async function tryEmailJS() {
  const SERVICE = env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) {
    console.error("EmailJS pas configuré, abandon");
    return false;
  }
  console.log(`[2/2] Fallback EmailJS vers ${TO}...`);
  const params = {
    to_email: TO, email: TO, user_email: TO, candidate_email: TO, to: TO,
    to_name: "Karim", name: "Karim", candidate_name: "Karim",
    from_name: "Caftan Factory (By AMD Megastore)",
    reply_to: "hr@caftanfactory.com",
    subject: SUBJECT,
    message: text, body: text, content: text,
    html_message: html, html: html,
    pdf_url: "",
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  if (res.ok) {
    console.log("✅ EmailJS OK.");
    return true;
  }
  const errTxt = await res.text();
  console.error(`EmailJS KO (HTTP ${res.status}): ${errTxt.slice(0, 300)}`);
  return false;
}

const ok = (await tryResend()) || (await tryEmailJS());
if (!ok) {
  console.error("❌ Aucun canal n'a abouti.");
  process.exit(1);
}
