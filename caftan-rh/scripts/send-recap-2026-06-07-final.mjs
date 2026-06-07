#!/usr/bin/env node
// Karim 2026-06-07 (final) : recap apres session "sois maitre d'ouvrage".
// Resume de tout : fix URL critique, crons GitHub Actions, tests prod,
// 4 actions utilisateur restantes, taches en cours, journal mails.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) { console.error("Pas de .env.local"); process.exit(1); }
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const RESEND_KEY = env.RESEND_API_KEY;
const RESEND_FROM = env.RESEND_FROM_EMAIL ?? "Caftan Factory <onboarding@resend.dev>";

const PROD = "https://caftan-rh.vercel.app";
const TO = "elbazikarim@gmail.com";
const SUBJECT = "[Caftan HR] ✅ Prod stable + 4 actions a faire de ton cote";

const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 740px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;">

<h1 style="color: #0f172a; border-bottom: 2px solid #d4af37; padding-bottom: 8px; font-size: 22px;">Caftan HR — session "maitre d'ouvrage" terminee</h1>

<p>Salut Karim,</p>

<p>L'app prod est en ligne, stable et auditee. <strong>4 actions manuelles</strong> de ta part sont necessaires pour finir de fiabiliser (toutes documentees plus bas, ~10 min au total).</p>

<div style="background: #f0fdf4; border: 1px solid #86efac; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <strong>🌐 URL prod stable :</strong> <a href="${PROD}" style="font-size: 17px; color: #15803d; font-weight: 600;">${PROD}</a><br>
  <span style="font-size: 13px; color: #166534;">Alias permanent, deja deploye avec le fix URL canonique. Bookmark-able.</span>
</div>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🔥 Le bug majeur identifie et corrige</h2>

<p>Tu m'avais dit : <em>"les destinataires ouvrent une page qui ne s'ouvre pas"</em>. J'ai trouve la cause exacte.</p>

<p><strong>Cause :</strong> dans <code>src/lib/public-base-url.ts</code>, la fonction <code>getPublicBaseUrl()</code> lisait <strong>en priorite</strong> <code>TUNNEL_URL.txt</code> — y compris en prod Vercel. Ce fichier contient l'URL d'un tunnel Cloudflare jetable qui change toutes les minutes et qui meurt des que ton PC est eteint.</p>

<p>Resultat : <strong>tous les mails envoyes depuis prod contenaient des liens vers une URL Cloudflare temporaire deja morte</strong> au moment ou les destinataires les ouvraient. Confirme empiriquement : j'ai appele <code>/api/cron/check-mail-links</code> en prod, qui a trouve <strong>5 mails recents casses sur 27</strong> tous pointant vers <code>everybody-newer-wages-ontario.trycloudflare.com</code> (tunnel mort).</p>

<p><strong>Fix (commit 35f26c6, deja en prod) :</strong> en environnement Vercel (<code>process.env.VERCEL</code>), <code>getPublicBaseUrl()</code> ignore desormais <code>TUNNEL_URL.txt</code> et utilise l'alias permanent <code>${PROD}</code>. Comportement local inchange (tunnel toujours prioritaire pour tes tests mobile).</p>

<p>En complement, j'ai pousse <code>NEXT_PUBLIC_SITE_URL=${PROD}</code> dans les env Vercel production.</p>

<p>→ <strong>Tous les FUTURS mails sortants pointeront vers <code>${PROD}/...</code></strong>. Les anciens mails deja envoyes restent casses (les URLs sont gravees dans les boites de destinataires) — voir action 4 plus bas si tu veux les re-envoyer.</p>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">✅ Ce qui a ete fait cette session</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Chantier</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Statut</th></tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Diagnostic build Vercel cassé (4 deploys en Error hier)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Cause = 2 fichiers source jamais commit</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Stubs <code>trainings/actions.ts</code> + <code>chat-ai/chat-client.tsx</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Commit tunnel 8ceb8b7 + redeploy</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Cleanup <code>next.config.ts</code> (eslint deprecated Next 16)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">URL canonique (<code>public-base-url.ts</code>) + env Vercel</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Commit 35f26c6 + redeploy</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Workflow GitHub Actions (33 crons)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">⚠️ Local, attend action 2 ci-dessous</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Migration <code>outbound_mails</code> (journal mails)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Commit 35f26c6 (a appliquer sur Supabase + cabler)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Test prod : Gravity Forms sync health</td><td style="padding: 8px; border: 1px solid #e2e8f0;">⚠️ <strong>400 candidats GF manquants en DB</strong> (1852 vs 1452)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Test prod : payslip-imap-poll</td><td style="padding: 8px; border: 1px solid #e2e8f0;">❌ <strong>503 - env GMAIL vides</strong> (voir action 3)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Test prod : check-mail-links</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 27 mails analyses, 5 casses identifies</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Mailing : EmailJS (le canal qui marche)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Ce mail en est la preuve</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Resend (testing mode, hr@caftanfactory.com seulement)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">⚠️ Necessite verification de domaine (action 4)</td></tr>
  </tbody>
</table>

<h2 style="color: #c2410c; margin-top: 32px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">🛠️ 4 actions a faire de ton cote</h2>

<p style="color: #64748b; font-style: italic;">Toutes simples, ~10 min total. Chacune debloque une partie de l'auto-pilote.</p>

<div style="background: #fff7ed; border: 1px solid #fdba74; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin-top: 0; color: #9a3412;">Action 1 — Pousser CRON_SECRET aux secrets GitHub (3 min)</h3>
  <p><strong>Pourquoi :</strong> sans ce secret, le workflow GitHub Actions qui rebranche les 33 crons ne pourra pas s'authentifier sur la prod Vercel. Resultat : aucun cron ne tournera (gf-sync, payslip-imap-poll, daily-reminders, scoring, anomaly-scan, etc.) — l'auto-pilote restera HS.</p>
  <p><strong>Comment :</strong></p>
  <ol style="margin-left: 16px;">
    <li>Recupere la valeur de CRON_SECRET depuis <code>caftan-rh/.env.local</code> (cle <code>CRON_SECRET=...</code>) ou depuis Vercel (<code>npx vercel env pull</code>).</li>
    <li>Va sur <a href="https://github.com/Elbakr/Formulaire_candidats/settings/secrets/actions">github.com/Elbakr/Formulaire_candidats/settings/secrets/actions</a></li>
    <li>"New repository secret" → Name: <code>CRON_SECRET</code> → Secret: la valeur → "Add secret"</li>
  </ol>
</div>

<div style="background: #fff7ed; border: 1px solid #fdba74; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin-top: 0; color: #9a3412;">Action 2 — Mettre a jour ton PAT GitHub avec le scope <code>workflow</code> + push le workflow (3 min)</h3>
  <p><strong>Pourquoi :</strong> j'ai cree <code>.github/workflows/caftan-crons.yml</code> en local, mais le push a ete refuse : <em>"refusing to allow a Personal Access Token to create or update workflow without workflow scope"</em>. Ton PAT actuel n'a pas la permission <code>workflow</code>.</p>
  <p><strong>Comment :</strong></p>
  <ol style="margin-left: 16px;">
    <li>Va sur <a href="https://github.com/settings/tokens">github.com/settings/tokens</a></li>
    <li>Soit "Generate new token (classic)" et coche <code>repo</code> + <code>workflow</code>, soit edite ton token existant pour ajouter <code>workflow</code>.</li>
    <li>Copie le nouveau token et mets-le a jour dans Git Credential Manager (sur Windows : Panneau de config → Comptes utilisateurs → Gestionnaire d'identification Windows → Identifiants Windows → cherche "git:https://github.com" → Modifier).</li>
    <li>Puis dans le repo :
      <pre style="background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 4px; font-size: 12px; overflow-x: auto;">cd C:\\Users\\KElba\\Documents\\GitHub\\Formulaire_candidats
git add .github/workflows/caftan-crons.yml
git commit -m "feat(crons): GitHub Actions workflow pour les 33 crons retires de vercel.json"
git push origin caftan-rh-v2-prod</pre>
    </li>
    <li>Une fois pushe, va sur <a href="https://github.com/Elbakr/Formulaire_candidats/actions">Actions tab</a> et verifie que "caftan-rh-crons" est liste. Tu peux le declencher manuellement via "Run workflow" pour test (laisse le champ endpoints vide pour ne rien declencher, ou mets "gf-sync-health" pour un test rapide).</li>
  </ol>
</div>

<div style="background: #fff7ed; border: 1px solid #fdba74; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin-top: 0; color: #9a3412;">Action 3 — Renseigner GMAIL_USER + GMAIL_APP_PASSWORD sur Vercel (2 min)</h3>
  <p><strong>Pourquoi :</strong> ces 2 env vars existent dans Vercel (visibles dans <code>vercel env ls</code>) mais leurs valeurs sont <strong>vides</strong>. Resultat :
    <ul>
      <li><code>payslip-imap-poll</code> renvoie 503 → <strong>aucune fiche de paie extraite automatiquement depuis hr@caftanfactory.com</strong></li>
      <li>SMTP Gmail (Nodemailer) du helper <code>mail-with-attachments.ts</code> tombe en fallback EmailJS au lieu d'envoyer en natif</li>
    </ul>
  </p>
  <p><strong>Comment :</strong></p>
  <ol style="margin-left: 16px;">
    <li>Generer un App Password Google sur <a href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a> (necessite 2FA active sur ton compte Google).</li>
    <li>Va sur <a href="https://vercel.com/karl-kani-s-projects/caftan-rh/settings/environment-variables">vercel.com → caftan-rh → Settings → Environment Variables</a>.</li>
    <li>Edite <code>GMAIL_USER</code> → mets <code>hr@caftanfactory.com</code> → Production → Save.</li>
    <li>Edite <code>GMAIL_APP_PASSWORD</code> → colle le App Password genere → Production → Save.</li>
    <li>Redeploie (ou attends le prochain push, qui re-build).</li>
  </ol>
</div>

<div style="background: #fff7ed; border: 1px solid #fdba74; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin-top: 0; color: #9a3412;">Action 4 — Verifier un domaine sur Resend (optionnel, 5 min)</h3>
  <p><strong>Pourquoi :</strong> Resend est aujourd'hui en mode "testing" → il refuse d'envoyer a une autre adresse que <code>hr@caftanfactory.com</code> (l'owner du compte). Tous les mails aux candidats/employes passent donc par EmailJS (qui marche, mais format moins riche). En verifiant un domaine, tu pourras envoyer via Resend en natif avec PJ PDF, meilleure deliverabilite et marque <code>@caftanfactory.com</code> au lieu de <code>@resend.dev</code>.</p>
  <p><strong>Comment :</strong></p>
  <ol style="margin-left: 16px;">
    <li>Va sur <a href="https://resend.com/domains">resend.com/domains</a></li>
    <li>"Add Domain" → <code>caftanfactory.com</code> → suit les instructions DNS (3 records TXT/MX a ajouter chez ton registrar, propagation ~10-30 min)</li>
    <li>Une fois verifie, modifie <code>RESEND_FROM_EMAIL</code> sur Vercel : <code>Caftan Factory &lt;hr@caftanfactory.com&gt;</code></li>
    <li>Resend prend la priorite sur EmailJS automatiquement (path 1 dans <code>mail-with-attachments.ts</code>).</li>
  </ol>
  <p style="font-size: 13px; color: #64748b;"><em>Si tu skip cette action, tout continue de marcher via EmailJS, juste moins joli.</em></p>
</div>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📋 Taches techniques restantes (priorisees)</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Tache</th><th style="text-align: center; padding: 8px; border: 1px solid #e2e8f0;">Priorite</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Pourquoi / Comment</th></tr></thead>
  <tbody>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Appliquer migration <code>outbound_mails</code> sur Supabase prod + cabler dans les 3 helpers</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #b45309; font-weight: 600; text-align: center;">HAUTE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Sans journal, impossible de detecter les futurs mails casses ou de prouver qu'un mail a ete envoye (audit RGPD).<br>Helper <code>logOutboundMail()</code> best-effort dans <code>lib/emails.ts</code>, <code>emailjs-client.ts</code>, <code>mail-with-attachments.ts</code>.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Rattraper les 400 candidats GF manquants</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #b45309; font-weight: 600; text-align: center;">HAUTE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">GF a 1852 entries vs 1452 en DB. Une fois le workflow GitHub Actions actif (action 1+2), le cron <code>*/15 gf-sync</code> rattrapera progressivement. Ou declenchement manuel via workflow_dispatch.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Re-envoyer les 5 mails casses identifies par check-mail-links</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #b45309; font-weight: 600; text-align: center;">HAUTE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Liste : 1 fiche de paie salmane-elbazi (mai 2026), 1 convention de cessation, +3 autres. Les destinataires ont des liens morts dans leurs boites. Je peux ecrire un script qui re-envoie avec les nouveaux URLs si tu valides.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Reconstruire <code>actions.ts</code> (formations PR #110)</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #64748b; text-align: center;">MOYENNE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Contrat connu, ~30 min. Schema table <code>employee_trainings</code> + upload base64 vers bucket Supabase + revalidatePath.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Reconstruire <code>chat-client.tsx</code> (chat AI PR #104)</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #64748b; text-align: center;">MOYENNE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Necessite tes inputs : modele Claude (Sonnet 4.6 / Haiku 4.5), prompt systeme, persistence historique, streaming, droits d'acces.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Cleanup ~15 erreurs TS pre-existantes</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #64748b; text-align: center;">BASSE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Aujourd'hui <code>typescript.ignoreBuildErrors=true</code>. Dette technique : masque les vraies erreurs futures.</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Dompter <code>tunnel-keeper.ps1</code></td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; color: #64748b; text-align: center;">BASSE</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">Maintenant que prod Vercel marche, le tunnel local n'est plus necessaire pour les destinataires externes. Il continue de polluer l'historique git (33+ commits/40min observes).<br>Recommendation : garde-le pour dev mobile, desactive l'auto-commit/push.</td>
    </tr>
  </tbody>
</table>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📦 Commits pushes cette session</h2>

<ul>
  <li><code>8ceb8b7</code> (commit tunnel-keeper) : stubs trainings/actions.ts + chat-ai/chat-client.tsx + cleanup config + vercel-crons-backup.json — englobes par le tunnel-keeper qui fait <code>git add -A</code> avant chaque tunnel</li>
  <li><code>35f26c6</code> <code>fix(public-url) + feat(db)</code> : fix critique URL canonique + migration outbound_mails</li>
</ul>

<p><strong>Non pushe (en local, attend action 2) :</strong> <code>.github/workflows/caftan-crons.yml</code> (33 crons via GitHub Actions, bloque par scope PAT).</p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🧪 Tests prod recommandes au retour</h2>

<ol>
  <li>Login sur <a href="${PROD}/login">${PROD}/login</a> avec ton compte habituel.</li>
  <li>Verifier que les modules /rh/* chargent (pipeline, screening, candidates, etc.).</li>
  <li>Verifier que /rh/trainings affiche bien la liste (le bouton "Ajouter formation" est stubbe, le reste marche).</li>
  <li>Verifier que /chat-ai affiche le placeholder "en reconstruction".</li>
  <li>Envoyer un magic link de test depuis l'app et confirmer que le lien recu pointe bien sur <code>${PROD}/...</code> (et NON sur trycloudflare).</li>
</ol>

<p style="margin-top: 32px; color: #64748b; font-style: italic; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
Envoye automatiquement depuis Claude Code apres redeploy prod.<br>
Inspector du dernier build : <a href="https://vercel.com/karl-kani-s-projects/caftan-rh/HpEgvQhQxeFSebKXfC32tqhsVSFt">vercel.com/karl-kani-s-projects/caftan-rh</a><br>
Branche : <code>caftan-rh-v2-prod</code> · Commits cette session : <code>8ceb8b7</code>, <code>35f26c6</code>
</p>

</body></html>`;

const text = `Caftan HR — session terminee ✅

PROD STABLE : ${PROD}

BUG MAJEUR FIXE : getPublicBaseUrl() lisait TUNNEL_URL.txt en prod
Vercel -> tous les mails pointaient vers un tunnel Cloudflare mort
des que ton PC etait eteint. Confirme par check-mail-links : 5 mails
casses sur 27 recents. Fix en place (commit 35f26c6, deja deploye).

4 ACTIONS DE TON COTE (~10 min total) :
1. Pousser CRON_SECRET aux GitHub Secrets (sinon 33 crons restent HS)
2. Mettre a jour PAT GitHub scope=workflow + push .github/workflows/
3. Renseigner GMAIL_USER + GMAIL_APP_PASSWORD sur Vercel
   (sinon payslip-imap-poll = 503 et pas d'extraction auto fiches paie)
4. (Optionnel) Verifier domaine caftanfactory.com sur Resend

TACHES RESTANTES priorisees dans le HTML.

400 candidats GF a rattraper (auto via cron */15 une fois action 1+2).
5 mails passes casses (URLs mortes), re-envoi possible si tu valides.

— Claude`;

async function tryResend() {
  console.log(`[1/2] Resend -> ${TO}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [TO], subject: SUBJECT, text, html, reply_to: "hr@caftanfactory.com" }),
  });
  if (res.ok) { console.log(`✅ Resend OK : ${(await res.json()).id}`); return true; }
  console.warn(`Resend KO (${res.status}): ${(await res.text()).slice(0, 150)}`);
  return false;
}

async function tryEmailJS() {
  const S = env.NEXT_PUBLIC_EMAILJS_SERVICE_ID, T = env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID, K = env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!S || !T || !K) { console.error("EmailJS pas configure"); return false; }
  console.log(`[2/2] EmailJS -> ${TO}`);
  const params = {
    to_email: TO, email: TO, user_email: TO, candidate_email: TO, to: TO,
    to_name: "Karim", name: "Karim", candidate_name: "Karim",
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: SUBJECT, message: text, body: text, content: text,
    html_message: html, html: html, pdf_url: "",
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: S, template_id: T, user_id: K, template_params: params }),
  });
  if (res.ok) { console.log("✅ EmailJS OK"); return true; }
  console.error(`EmailJS KO (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return false;
}

const ok = (await tryResend()) || (await tryEmailJS());
if (!ok) { console.error("❌ Aucun canal n'a abouti"); process.exit(1); }
