#!/usr/bin/env node
// Karim 2026-06-08 : guide simple "reprendre le projet sur Mac".
// Le repo git est la source de verite (pas de zip attache : ~50MB sans
// node_modules + secrets dans .env.local). Pull depuis GitHub puis recupere
// les env vars via vercel env pull.

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
const REPO = "https://github.com/Elbakr/Formulaire_candidats";
const BRANCH = "caftan-rh-v2-prod";
const TARGETS = ["elbazikarim@gmail.com", "hr@caftanfactory.com"];
const SUBJECT = "[Caftan HR] Reprendre le projet sur Mac — guide simple 6 etapes";

const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;">

<h1 style="color: #0f172a; border-bottom: 2px solid #d4af37; padding-bottom: 8px; font-size: 22px;">Reprendre Caftan HR sur Mac — guide simple</h1>

<p>Salut Karim,</p>

<p>Je ne peux pas litteralement attacher tout le projet (~50 MB sans node_modules, et le .env.local contient des secrets qu'on ne veut pas balader en piece jointe). Mais la source de verite est sur GitHub et je te donne ci-dessous les 6 etapes pour tout recuperer sur ton Mac en ~10 min.</p>

<div style="background: #f0fdf4; border: 1px solid #86efac; padding: 14px 18px; border-radius: 8px; margin: 16px 0;">
  <strong>📦 Le dossier complet est ici :</strong><br>
  <a href="${REPO}" style="font-size: 16px; color: #15803d; font-weight: 600;">${REPO}</a><br>
  Branche de travail : <code>${BRANCH}</code>
</div>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 1 — Pre-requis (a faire UNE SEULE FOIS)</h2>

<p>Ouvre <strong>Terminal</strong> (Cmd+Espace > taper "Terminal" > Enter) et verifie que tu as les bons outils :</p>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">git --version
node --version    # doit etre &gt;= 20.0 (ideal 24.x)
npm --version</pre>

<p>Si <strong>git</strong> manque : il s'installe via Xcode Command Line Tools (le terminal te le proposera automatiquement la 1ere fois que tu tapes <code>git</code>).</p>

<p>Si <strong>node</strong> manque ou trop vieux : installe Homebrew puis Node :</p>
<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node@24
brew link --overwrite node@24</pre>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 2 — Cloner le projet</h2>

<p>Place-toi dans le dossier ou tu veux mettre le projet (ex: <code>~/Documents/GitHub</code>), puis :</p>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">mkdir -p ~/Documents/GitHub
cd ~/Documents/GitHub
git clone ${REPO}.git
cd Formulaire_candidats
git checkout ${BRANCH}</pre>

<p>Le repo va se telecharger (~200 MB avec l'historique). Si Git te demande de t'authentifier : utilise ton login GitHub <strong>elbazikarim@gmail.com</strong> + ton <strong>Personal Access Token</strong> comme mot de passe (PAT cree sur <a href="https://github.com/settings/tokens">github.com/settings/tokens</a> — coche bien <code>repo</code> + <code>workflow</code>).</p>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 3 — Configurer Git (si premiere fois sur ce Mac)</h2>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">git config --global user.name "Karim Elbazi"
git config --global user.email "elbazikarim@gmail.com"</pre>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 4 — Recuperer les secrets (.env.local)</h2>

<p>Le fichier <code>.env.local</code> contient toutes les cles API (Supabase, Resend, EmailJS, Anthropic, GMAIL, etc.). Il <strong>n'est PAS sur GitHub</strong> (volontairement). Tu le recuperes depuis Vercel en une commande :</p>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">cd caftan-rh
npx vercel login         # 1ere fois seulement : ouvre le navigateur pour login
npx vercel link --yes    # lie le projet local au projet Vercel caftan-rh
npx vercel env pull .env.local --environment=production --yes</pre>

<p>A la fin, <code>caftan-rh/.env.local</code> est cree avec toutes les valeurs production. <strong>Ne jamais commit ce fichier</strong> (deja dans <code>.gitignore</code>).</p>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 5 — Installer les dependances</h2>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">cd caftan-rh
npm install --legacy-peer-deps</pre>

<p>Ca telecharge ~1.5 GB de modules dans <code>node_modules/</code>. Compter 2-5 min selon ton internet. Le flag <code>--legacy-peer-deps</code> est important (sinon npm grogne sur des peer deps).</p>

<h2 style="color: #0f172a; margin-top: 28px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Etape 6 — Lancer l'app en local OU travailler directement sur prod</h2>

<p><strong>Option A — Dev local (recommande pour modifier du code)</strong> :</p>
<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">cd caftan-rh
npm run dev</pre>
<p>L'app demarre sur <code>http://localhost:3000</code>. Tu peux modifier le code, ca rechargera tout seul (HMR).</p>

<p><strong>Option B — Tester directement la prod (sans dev)</strong> :</p>
<p>Va sur <a href="${PROD}">${PROD}</a> dans Safari/Chrome, login avec ton mail habituel.</p>

<p><strong>Option C — Redeployer apres une modif</strong> :</p>
<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">cd caftan-rh
node scripts/vercel-deploy-quick.mjs</pre>
<p>Ca prend ~2 min. L'URL prod <code>${PROD}</code> est mise a jour.</p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📋 Workflow quotidien sur Mac</h2>

<p>Une fois tout installe, voici le cycle normal pour bosser :</p>

<pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">cd ~/Documents/GitHub/Formulaire_candidats
git pull --rebase origin ${BRANCH}      # recupere les nouveautes
# ... fais tes modifs ...
cd caftan-rh
npm run dev                              # tester en local
# ... satisfaction, on commit ...
cd ..
git add -A
git commit -m "ton message clair"
git push origin ${BRANCH}                # push vers GitHub
cd caftan-rh
node scripts/vercel-deploy-quick.mjs    # redeployer en prod</pre>

<p style="font-size: 13px; color: #64748b;"><em>Note : le script <code>tunnel-keeper.ps1</code> est Windows-only. Tu n'en as plus besoin sur Mac car prod Vercel est en ligne 24/7. Si tu veux le port-forward local pour tester sur mobile, utilise <code>ngrok</code> ou <code>cloudflared</code> en standalone.</em></p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🔗 Liens utiles a bookmarker</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Service</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">URL</th></tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">App prod</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="${PROD}">${PROD}</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Login</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="${PROD}/login">${PROD}/login</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Repo GitHub</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="${REPO}">${REPO}</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Vercel dashboard</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="https://vercel.com/karl-kani-s-projects/caftan-rh">vercel.com/karl-kani-s-projects/caftan-rh</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Supabase dashboard</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="https://supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw">supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">Resend dashboard</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="https://resend.com">resend.com</a></td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">GitHub Actions (crons)</td><td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="https://github.com/Elbakr/Formulaire_candidats/actions">repo > Actions</a></td></tr>
  </tbody>
</table>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🚨 En cas de probleme</h2>

<ul>
  <li><strong>"vercel: command not found"</strong> apres etape 4 : remplace <code>vercel</code> par <code>npx --yes vercel@latest</code> partout.</li>
  <li><strong>"git: permission denied"</strong> au push : ton PAT a expire ou n'a pas le bon scope. Regenere sur <a href="https://github.com/settings/tokens">github.com/settings/tokens</a> avec <code>repo</code> + <code>workflow</code> coches.</li>
  <li><strong>"npm install" plante</strong> : ajoute le flag <code>--force</code> apres <code>--legacy-peer-deps</code>.</li>
  <li><strong>L'app local ne charge pas Supabase</strong> : <code>.env.local</code> mal recupere, refais l'etape 4. Verifie que <code>cat .env.local | head -5</code> affiche bien des valeurs (et pas du vide).</li>
  <li><strong>Erreur de build Vercel</strong> : verifie le log Vercel via <code>npx vercel inspect &lt;url-deploy&gt; --logs</code>.</li>
</ul>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">📂 Structure du projet en bref</h2>

<pre style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto;">Formulaire_candidats/
├── .github/workflows/      ← workflows GitHub Actions (crons)
├── CLAUDE.md               ← instructions pour Claude Code
├── MASTER_SPEC.md          ← spec produit (la vision)
└── caftan-rh/              ← l'app Next.js
    ├── src/
    │   ├── app/            ← pages + routes API + server actions
    │   │   ├── api/cron/   ← 33 endpoints crons
    │   │   ├── rh/         ← pages RH (admin)
    │   │   ├── planning/   ← module planning
    │   │   └── ...
    │   ├── lib/            ← helpers metier (mail, push, public-url, etc.)
    │   └── components/     ← composants React reutilisables
    ├── scripts/            ← outils Node (deploy, recap, tests, ...)
    ├── supabase/migrations ← schemas DB versionnes
    ├── public/             ← assets statiques (sw.js, icons)
    ├── .env.local          ← secrets (a recuperer via vercel env pull)
    └── package.json</pre>

<p style="margin-top: 32px; color: #64748b; font-style: italic; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
Envoye en double : elbazikarim@gmail.com + hr@caftanfactory.com (redondance).<br>
Si bloque sur une etape, repond a ce mail avec le message d'erreur exact, je peux te depanner a distance via la prochaine session.<br>
Date : 2026-06-08
</p>

</body></html>`;

const text = `Reprendre Caftan HR sur Mac — guide simple

Repo : ${REPO}
Branche : ${BRANCH}
App prod : ${PROD}

ETAPE 1 — Pre-requis (une seule fois)
Terminal :
  git --version
  node --version    (>= 20, ideal 24)
  npm --version
Si manque : Xcode CLI (auto-propose) + Homebrew + brew install node@24

ETAPE 2 — Cloner
  mkdir -p ~/Documents/GitHub
  cd ~/Documents/GitHub
  git clone ${REPO}.git
  cd Formulaire_candidats
  git checkout ${BRANCH}
Login GitHub : elbazikarim@gmail.com + PAT (scope repo + workflow)

ETAPE 3 — Config git (premiere fois)
  git config --global user.name "Karim Elbazi"
  git config --global user.email "elbazikarim@gmail.com"

ETAPE 4 — Recuperer les secrets (.env.local)
  cd caftan-rh
  npx vercel login
  npx vercel link --yes
  npx vercel env pull .env.local --environment=production --yes

ETAPE 5 — Installer dependances
  cd caftan-rh
  npm install --legacy-peer-deps

ETAPE 6 — Lancer
  npm run dev                              -> http://localhost:3000
  node scripts/vercel-deploy-quick.mjs    -> redeployer prod

WORKFLOW QUOTIDIEN
  git pull --rebase origin ${BRANCH}
  ... modifs ...
  cd caftan-rh && npm run dev (test)
  cd .. && git add -A && git commit -m "..." && git push origin ${BRANCH}
  cd caftan-rh && node scripts/vercel-deploy-quick.mjs

LIENS UTILES
- App prod : ${PROD}
- Vercel : vercel.com/karl-kani-s-projects/caftan-rh
- Supabase : supabase.com/dashboard/project/zqlcjcghekdfkwrimxqw
- Repo : ${REPO}
- GitHub Actions : ${REPO}/actions

EN CAS DE PROBLEME
- "vercel: command not found" -> npx --yes vercel@latest
- git "permission denied" -> regenerer PAT (scope repo + workflow)
- npm install plante -> ajouter --force
- App local sans Supabase -> refaire etape 4
- Erreur build Vercel -> npx vercel inspect <url> --logs

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
  if (!S || !T || !K) return false;
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
process.exit(results.some(r => r.ok) ? 0 : 1);
