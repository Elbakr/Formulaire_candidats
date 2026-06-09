#!/usr/bin/env node
// Karim 2026-06-08 : mail final ACCES + recap exhaustif session.
// Karim m'a dit : "je ne serai plus dispo pour t'autoriser, envoie-moi
// un mail dans tous les cas avec une adresse qui fonctionne pour garder
// l'acces distant". Donc on envoie a 2 adresses (principal + redondance).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const RESEND_KEY = env.RESEND_API_KEY;
const RESEND_FROM = env.RESEND_FROM_EMAIL ?? "Caftan Factory <onboarding@resend.dev>";
const PROD = "https://caftan-rh.vercel.app";
const TARGETS = ["elbazikarim@gmail.com", "hr@caftanfactory.com"]; // redondance
const SUBJECT = "[Caftan HR] 🔐 Acces distant prod + journal mails cable + 4 actions";

const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 740px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;">

<h1 style="color: #0f172a; border-bottom: 2px solid #d4af37; padding-bottom: 8px; font-size: 22px;">Caftan HR — acces distant + recap final</h1>

<p>Salut Karim,</p>

<p>Tu as quitte le bureau et tu m'as autorise a finir tout seul. Voici l'etat exhaustif a 2026-06-08, avec tous les acces pour reprendre a distance.</p>

<div style="background: #f0fdf4; border: 2px solid #15803d; padding: 16px 20px; border-radius: 8px; margin: 20px 0;">
  <h2 style="margin: 0 0 8px 0; color: #14532d; font-size: 18px;">🔐 ACCES DISTANT</h2>
  <p style="margin: 8px 0;"><strong>URL prod :</strong> <a href="${PROD}" style="font-size: 17px; color: #15803d; font-weight: 600;">${PROD}</a></p>
  <p style="margin: 8px 0;"><strong>Login :</strong> <a href="${PROD}/login">${PROD}/login</a></p>
  <p style="margin: 8px 0;"><strong>Identifiants :</strong> ton compte habituel (elbazikarim@gmail.com + ton mot de passe), magic link disponible aussi.</p>
  <p style="margin: 8px 0;"><strong>Reset password :</strong> <a href="${PROD}/login/reset-password">${PROD}/login/reset-password</a></p>
  <p style="margin: 8px 0;"><strong>Vercel dashboard :</strong> <a href="https://vercel.com/karl-kani-s-projects/caftan-rh">vercel.com/karl-kani-s-projects/caftan-rh</a></p>
  <p style="margin: 8px 0;"><strong>Supabase dashboard :</strong> <a href="https://supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw">supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw</a></p>
  <p style="margin: 8px 0;"><strong>GitHub repo :</strong> <a href="https://github.com/Elbakr/Formulaire_candidats">github.com/Elbakr/Formulaire_candidats</a> (branche <code>caftan-rh-v2-prod</code>)</p>
  <p style="margin: 8px 0; font-size: 13px; color: #166534;"><em>Ce mail est envoye en double : elbazikarim@gmail.com + hr@caftanfactory.com pour redondance. Bookmark cette URL prod, elle est stable.</em></p>
</div>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">✅ Travail accompli cette session (3 commits)</h2>

<ol>
  <li><strong>Build Vercel debloque</strong> (commit <code>8ceb8b7</code> via tunnel-keeper) : stubs pour les 2 fichiers source perdus (<code>trainings/actions.ts</code>, <code>chat-ai/chat-client.tsx</code>), <code>next.config.ts</code> nettoye, crons retires de <code>vercel.json</code>.</li>
  <li><strong>URL canonique fixee</strong> (commit <code>35f26c6</code>) : <code>getPublicBaseUrl()</code> ignore <code>TUNNEL_URL.txt</code> en prod Vercel et utilise l'alias permanent. Avant : tous les mails pointaient vers des tunnels Cloudflare morts (5/27 confirmes par check-mail-links). Maintenant : URLs stables. Migration <code>outbound_mails</code> appliquee a Supabase prod (deja 28 lignes existantes preservees).</li>
  <li><strong>Journal <code>outbound_mails</code> cable</strong> (commit <code>39fbe72</code>) : nouveau helper <code>src/lib/outbound-mails-log.ts</code> qui insere best-effort dans la table. Cable dans les 3 helpers d'envoi :
    <ul>
      <li><code>src/lib/emails.ts</code> (Resend + 4 wrappers : application-ack, interview-invite, rejection, offer)</li>
      <li><code>src/lib/emailjs-client.ts</code> (EmailJS direct, dynamic import server-side pour rester safe cote client)</li>
      <li><code>src/lib/mail-with-attachments.ts</code> (3 paths : Resend / SMTP Gmail / EmailJS, log par destinataire pour EmailJS)</li>
    </ul>
    Best-effort : jamais d'echec d'envoi cause par le log. Status (sent/failed) et delivery_provider (resend/smtp_gmail/emailjs/none) traces.
  </li>
</ol>

<p>Etat actuel de la table : <strong>28 lignes</strong>, sources existantes (avant moi) : <code>contract_signature</code> (10), <code>payslip_share</code> (9), <code>info_request</code> (5), <code>payslip_share_external</code> (3), <code>contract_employer_archive</code> (1) — toutes via emailjs avec status=sent. Mon cablage ajoute la couverture pour TOUS les autres helpers (notamment Resend qui n'etait pas trace).</p>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🧪 Tests effectues</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Test</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Resultat</th></tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><code>${PROD}/login</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 200 OK, formulaire email present</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><code>${PROD}/</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 200 OK</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><code>/api/cron/gf-sync-health</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 200 / ⚠️ 400 candidats GF non syncs (1852 vs 1452)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><code>/api/cron/check-mail-links</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 27 mails analyses, 5 casses identifies (URLs Cloudflare mortes — fixe pour les FUTURS mails)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><code>/api/cron/payslip-imap-poll</code></td><td style="padding: 8px; border: 1px solid #e2e8f0;">❌ 503 — env GMAIL_USER/GMAIL_APP_PASSWORD vides (cf action 3)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Migration <code>outbound_mails</code> sur Supabase prod</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ Appliquee (idempotente), table : 21 cols, 3 RLS policies, 1 trigger</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Redeploys Vercel</td><td style="padding: 8px; border: 1px solid #e2e8f0;">✅ 3 deploys READY (URL fix, public-url fix, outbound-mails cablage)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Test cablage outbound_mails en live</td><td style="padding: 8px; border: 1px solid #e2e8f0;">⚠️ Pas teste en live (effets de bord sur destinataires reels). Validation : le code compile et deploy READY. Test reel se fera au prochain envoi naturel — il faudra recompter <code>outbound_mails</code> dans 24h pour voir les nouveaux providers (resend, smtp_gmail) apparaitre.</td></tr>
  </tbody>
</table>

<h2 style="color: #c2410c; margin-top: 32px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">🛠️ 4 actions de ton cote (~10 min total)</h2>

<p>Pas changeantes par rapport au mail precedent — toujours bloquees par tes acces personnels.</p>

<ol>
  <li><strong>Pousser CRON_SECRET aux secrets GitHub</strong> sur <a href="https://github.com/Elbakr/Formulaire_candidats/settings/secrets/actions">github.com/Elbakr/Formulaire_candidats/settings/secrets/actions</a>. Valeur : copie depuis ton <code>.env.local</code> ou <code>npx vercel env pull</code>. <em>Sans ca, les 33 crons restent HS.</em></li>
  <li><strong>Mettre a jour ton PAT GitHub avec scope <code>workflow</code></strong> sur <a href="https://github.com/settings/tokens">github.com/settings/tokens</a>, puis dans le repo local :
    <pre style="background: #1e293b; color: #e2e8f0; padding: 8px; border-radius: 4px; font-size: 12px; overflow-x: auto;">git add .github/workflows/caftan-crons.yml
git commit -m "feat(crons): GitHub Actions pour les 33 crons retires de vercel.json"
git push origin caftan-rh-v2-prod</pre>
    Le workflow est <strong>deja ecrit en local</strong> (sur ton PC, non pushe), il suffit de le commit + push avec le bon scope PAT.
  </li>
  <li><strong>Renseigner GMAIL_USER + GMAIL_APP_PASSWORD sur Vercel</strong> (valeurs actuellement vides). App Password Google sur <a href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a> (necessite 2FA). Puis Vercel > caftan-rh > Settings > Environment Variables > Production. <em>Sans ca, extraction auto fiches paie KO + SMTP Gmail KO (fallback EmailJS uniquement).</em></li>
  <li><strong>(Optionnel) Verifier domaine caftanfactory.com sur Resend</strong> sur <a href="https://resend.com/domains">resend.com/domains</a> pour pouvoir envoyer en natif a tous les candidats/employes (pas seulement hr@). Sans ca, Resend reste limite a hr@caftanfactory.com en mode testing → mes wrappers Resend dans <code>emails.ts</code> n'enverront pas aux candidats reels (mais auront leur trace en outbound_mails avec status=failed).</li>
</ol>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📋 Backlog des taches techniques</h2>

<ul>
  <li><strong>HAUTE</strong> — Re-envoyer les 5 mails casses identifies par check-mail-links (les destinataires ont des liens morts dans leurs boites). Script de re-envoi a ecrire (1h).</li>
  <li><strong>HAUTE</strong> — Rattraper les 400 candidats GF manquants (auto via cron */15 une fois action 1+2 faites).</li>
  <li><strong>MOYENNE</strong> — Reconstruire <code>actions.ts</code> (formations PR #110) : contrat connu, ~30 min.</li>
  <li><strong>MOYENNE</strong> — Reconstruire <code>chat-client.tsx</code> (chat AI PR #104) : besoin de tes inputs (modele Claude, prompt, persistence, droits).</li>
  <li><strong>MOYENNE</strong> — UI <code>/rh/mails</code> pour consulter le journal <code>outbound_mails</code> (filtres source/status/provider/destinataire, alerte sur spike d'echecs).</li>
  <li><strong>BASSE</strong> — Cleanup ~15 erreurs TS pre-existantes (actuellement <code>ignoreBuildErrors</code>).</li>
  <li><strong>BASSE</strong> — Dompter <code>tunnel-keeper.ps1</code> : continue de polluer l'historique git (~1 commit/min). Recommande : desactiver l'auto-commit/push maintenant que prod Vercel est en ligne.</li>
</ul>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📦 Commits cette session</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">SHA</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Description</th></tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">8ceb8b7</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Stubs + cleanup config (englobe dans un commit tunnel)</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">35f26c6</td><td style="padding: 8px; border: 1px solid #e2e8f0;">fix(public-url) + feat(db) : URL canonique + migration outbound_mails</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">39fbe72</td><td style="padding: 8px; border: 1px solid #e2e8f0;">feat(outbound-mails) : cablage du journal dans les 3 helpers</td></tr>
  </tbody>
</table>

<p><strong>Local non pushe (attend action 2) :</strong> <code>.github/workflows/caftan-crons.yml</code></p>

<p style="margin-top: 32px; color: #64748b; font-style: italic; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
Envoye depuis Claude Code en mode autonome (Karim parti).<br>
Branche : <code>caftan-rh-v2-prod</code> · Heure : 2026-06-08<br>
Si tu ne recois pas ce mail sur elbazikarim@gmail.com, verifie hr@caftanfactory.com (envoye en double pour redondance).<br>
Pour reprendre : login sur <a href="${PROD}/login">${PROD}/login</a>, puis fais les 4 actions ci-dessus pour finaliser.
</p>

</body></html>`;

const text = `Caftan HR — acces distant + recap final (2026-06-08)

🔐 ACCES DISTANT
URL prod : ${PROD}
Login    : ${PROD}/login
Reset pw : ${PROD}/login/reset-password
Vercel   : vercel.com/karl-kani-s-projects/caftan-rh
Supabase : supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw
GitHub   : github.com/Elbakr/Formulaire_candidats (branche caftan-rh-v2-prod)

Mail envoye a elbazikarim@gmail.com + hr@caftanfactory.com (redondance).

TRAVAIL ACCOMPLI :
- 3 commits : stubs build / fix URL canonique / cablage outbound_mails
- Migration outbound_mails appliquee a Supabase prod (28 lignes preservees)
- 3 redeploys Vercel READY
- Helpers cables : emails.ts (Resend), emailjs-client.ts, mail-with-attachments.ts (3 paths)

TESTS : login OK, home OK, gf-sync-health OK (gap 400 candidats), check-mail-links 5 mails casses, payslip-imap-poll 503 (env vides).

4 ACTIONS DE TON COTE :
1. Pousser CRON_SECRET aux secrets GitHub
2. PAT scope=workflow + push .github/workflows/caftan-crons.yml
3. Renseigner GMAIL_USER + GMAIL_APP_PASSWORD sur Vercel
4. (Optionnel) Verifier domaine caftanfactory.com sur Resend

BACKLOG : re-envoyer 5 mails casses, rattraper 400 candidats GF, reconstruire actions.ts + chat-client.tsx, UI /rh/mails, cleanup TS, dompter tunnel-keeper.

Tout le detail dans la version HTML de ce mail.

— Claude`;

async function tryResend(to) {
  console.log(`[resend] -> ${to}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: SUBJECT, text, html, reply_to: "hr@caftanfactory.com" }),
  });
  if (res.ok) { console.log(`  ✅ Resend OK : ${(await res.json()).id}`); return true; }
  console.warn(`  Resend KO (${res.status}): ${(await res.text()).slice(0, 150)}`);
  return false;
}

async function tryEmailJS(to) {
  const S = env.NEXT_PUBLIC_EMAILJS_SERVICE_ID, T = env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID, K = env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!S || !T || !K) { console.error("  EmailJS pas configure"); return false; }
  console.log(`[emailjs] -> ${to}`);
  const params = {
    to_email: to, email: to, user_email: to, candidate_email: to, to,
    to_name: "Karim", name: "Karim", candidate_name: "Karim",
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: SUBJECT, message: text, body: text, content: text,
    html_message: html, html, pdf_url: "",
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: S, template_id: T, user_id: K, template_params: params }),
  });
  if (res.ok) { console.log("  ✅ EmailJS OK"); return true; }
  console.error(`  EmailJS KO (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return false;
}

const results = [];
for (const t of TARGETS) {
  console.log(`\n=== Cible : ${t} ===`);
  const ok = (await tryResend(t)) || (await tryEmailJS(t));
  results.push({ to: t, ok });
}

console.log("\n=== RECAP ===");
console.table(results);
const anyOk = results.some(r => r.ok);
process.exit(anyOk ? 0 : 1);
