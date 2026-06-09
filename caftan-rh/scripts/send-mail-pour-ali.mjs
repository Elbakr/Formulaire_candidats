#!/usr/bin/env node
// Karim 2026-06-08 : redige et envoie un mail destine a Ali (admin domaine
// caftanfactory.com + Workspace Google) avec toutes les actions infra qu'il
// doit accomplir pour debloquer les fonctionnalites manquantes de l'app RH.
//
// Envoye a Karim (elbazikarim + hr@) en double pour qu'il puisse le forward
// a Ali quand il aura son adresse (Karim ne me l'a pas donnee).

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
const TARGETS = ["elbazikarim@gmail.com", "hr@caftanfactory.com"];
const SUBJECT = "[A FORWARDER A ALI] Configuration infra caftanfactory.com pour app RH";

const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;">

<div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 12px 18px; border-radius: 6px; margin-bottom: 20px;">
  <strong>Karim :</strong> ce mail est un brouillon a forwarder a Ali (admin domaine + Workspace caftanfactory.com). Tu peux le copier-coller dans ton client mail. J'ai prepare le contenu pour qu'Ali ait toutes les infos a portee de main, etape par etape. Le sujet propose : "Caftan HR — actions infra pour debloquer fonctionnalites manquantes".
</div>

<hr style="border: none; border-top: 2px solid #cbd5e1; margin: 24px 0;">

<h1 style="color: #0f172a; font-size: 22px;">Caftan HR — actions infrastructure pour debloquer fonctionnalites manquantes</h1>

<p>Salut Ali,</p>

<p>J'ai deploye l'application RH de Caftan Factory en production (<a href="${PROD}">${PROD}</a>). Plusieurs fonctionnalites critiques sont aujourd'hui partiellement ou totalement HS car elles dependent d'infrastructure que <strong>seul un admin du domaine caftanfactory.com / du Workspace Google peut configurer</strong>. C'est ta zone, je n'y ai pas les acces.</p>

<p>J'ai liste ci-dessous <strong>5 actions concretes</strong>, classees par criticite. Pour chacune : le pourquoi (quelle fonctionnalite app debloquee), le comment (etapes precises), et le livrable attendu (ce que tu dois me retourner).</p>

<p>Compte ~45 min total. Toutes les actions sont independantes, tu peux les faire dans n'importe quel ordre.</p>

<h2 style="color: #c2410c; margin-top: 28px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">🔥 ACTION 1 — Verifier le domaine caftanfactory.com sur Resend (PRIORITE HAUTE, 10 min)</h2>

<p><strong>Pourquoi :</strong> Resend est notre service d'envoi de mails transactionnels (acquittements candidats, convocations entretien, offres, fiches de paie, signatures contrat, etc.). Aujourd'hui le compte est en mode "testing" → Resend refuse tout envoi a une adresse autre que hr@caftanfactory.com. <strong>Tous les mails aux candidats et employes externes sont actuellement bloques</strong> (fallback EmailJS qui marche mais sans pieces jointes natives ni marque @caftanfactory.com).</p>

<p><strong>Comment :</strong></p>
<ol>
  <li>Je te fais inviter par mail comme membre de l'equipe Resend (demande-moi l'invitation, ou cree un compte sur <a href="https://resend.com">resend.com</a> avec ton mail Caftan Factory et je t'ajoute).</li>
  <li>Aller sur <a href="https://resend.com/domains">resend.com/domains</a> > "Add Domain" > saisir <code>caftanfactory.com</code></li>
  <li>Resend va afficher 3 a 5 records DNS a ajouter :
    <ul>
      <li>1 record <strong>TXT</strong> pour SPF (du genre <code>v=spf1 include:amazonses.com ~all</code> — important, doit aussi inclure Google : voir Action 3)</li>
      <li>3 records <strong>CNAME</strong> pour DKIM (du genre <code>resend._domainkey.caftanfactory.com</code>)</li>
      <li>1 record <strong>MX</strong> ou TXT pour return-path / bounce (optionnel mais recommande)</li>
    </ul>
  </li>
  <li>Ajouter ces records chez le registrar DNS du domaine (probablement OVH / Gandi / 1&1 selon votre setup). Propagation 5-30 min.</li>
  <li>Retourner sur Resend et cliquer "Verify Domain" jusqu'a ce que tous passent au vert.</li>
  <li>Une fois verifie : <strong>changer la variable <code>RESEND_FROM_EMAIL</code> sur Vercel</strong> (Karim peut le faire, juste donne-lui la valeur cible : <code>Caftan Factory &lt;hr@caftanfactory.com&gt;</code>).</li>
</ol>

<p><strong>Livrable :</strong> me confirmer "Resend domain verified" + screenshot. Ensuite Karim mettra a jour <code>RESEND_FROM_EMAIL</code>.</p>

<h2 style="color: #c2410c; margin-top: 28px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">🔥 ACTION 2 — Generer un App Password Google pour hr@caftanfactory.com (PRIORITE HAUTE, 5 min)</h2>

<p><strong>Pourquoi :</strong> 2 fonctionnalites critiques de l'app dependent de l'acces a la boite hr@caftanfactory.com :</p>
<ul>
  <li><strong>Extraction automatique des fiches de paie</strong> : un cron poll IMAP cette boite toutes les 30 min, detecte les mails du secretariat social (Partena, HR Consult, Securex, Acerta, Group S), extrait les PDF, matche avec l'employe correspondant et stocke dans Supabase. Aujourd'hui : <strong>error 503 — env vars vides</strong>. Resultat : Karim doit gerer 30+ fiches de paie/mois manuellement.</li>
  <li><strong>Envoi SMTP Gmail natif</strong> avec pieces jointes binaires (PDF contrat, fiche paie, attestation Dimona, etc.) — alternative a Resend, marque @caftanfactory.com directement.</li>
</ul>

<p><strong>Comment :</strong></p>
<ol>
  <li><strong>S'assurer que la 2FA est activee sur hr@caftanfactory.com</strong>. Si pas le cas, activer via Admin Console Workspace ou directement sur <a href="https://myaccount.google.com/security">myaccount.google.com/security</a>.</li>
  <li><strong>Verifier que IMAP est autorise au niveau Workspace</strong> : Admin Console > Apps > Google Workspace > Gmail > End User Access > "POP and IMAP Access" doit etre <strong>ON</strong>. (Souvent OFF par defaut dans les Workspace strictes.)</li>
  <li><strong>Verifier que les App Passwords sont autorises</strong> : Admin Console > Security > Less Secure Apps and Your Google Account (note : la politique "Less secure apps" est deprecee, mais les App Passwords restent disponibles si 2FA est ON).</li>
  <li>Login sur hr@caftanfactory.com > <a href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a> > generer un App Password nomme "Caftan HR App". Tu obtiens un mot de passe de 16 caracteres.</li>
  <li>Me transmettre les 2 valeurs en mail securise OU directement les saisir sur Vercel :
    <pre style="background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 4px; font-size: 12px;">GMAIL_USER         = hr@caftanfactory.com
GMAIL_APP_PASSWORD = xxxx xxxx xxxx xxxx  (16 chars, espaces optionnels)</pre>
  </li>
</ol>

<p><strong>Note alternative</strong> : si Google Workspace bloque les App Passwords (politique enterprise stricte), alternative plus robuste = <strong>Service Account avec delegation domain-wide</strong> (OAuth 2.0). Plus securise mais necessite un changement de code cote app (~2h dev). Si tu prefers cette voie, dis-moi et je m'adapte.</p>

<p><strong>Livrable :</strong> les 2 env vars (GMAIL_USER + GMAIL_APP_PASSWORD), transmises de facon securisee (signal/WhatsApp prive ou Vercel directement si tu as les acces).</p>

<h2 style="color: #c2410c; margin-top: 28px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">⚡ ACTION 3 — Configurer SPF / DKIM / DMARC pour caftanfactory.com (PRIORITE HAUTE, 15 min)</h2>

<p><strong>Pourquoi :</strong> sans ces records, les mails envoyes depuis l'app (que ce soit via Resend ou via Gmail SMTP) finissent en spam chez les destinataires (candidats, employes, secretariat social). Cela ruine 80% de l'experience utilisateur. Particulierement critique pour les fiches de paie et les magic links de signature qui sont temps-sensitive.</p>

<p><strong>Comment :</strong></p>

<p><strong>SPF (un seul record TXT a la racine du domaine)</strong> :</p>
<pre style="background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 4px; font-size: 12px;">Nom    : @  (racine)
Type   : TXT
Valeur : v=spf1 include:_spf.google.com include:amazonses.com ~all</pre>
<p>Note : <code>amazonses.com</code> est l'infra Resend. <code>_spf.google.com</code> couvre Gmail Workspace. Le <code>~all</code> = softfail (recommande pour eviter les faux positifs en transition). Une fois stable, on peut passer a <code>-all</code> (hard fail).</p>

<p><strong>DKIM</strong> : 2 sets de cles a configurer en parallele.</p>
<ol>
  <li><strong>Cle DKIM Google Workspace</strong> : Admin Console > Apps > Google Workspace > Gmail > Authenticate Email > "Generate new record" > copier le record et l'ajouter au DNS (sous-domaine <code>google._domainkey.caftanfactory.com</code> generalement). Apres propagation, revenir et cliquer "Start authentication" pour signer les mails sortants Gmail.</li>
  <li><strong>Cle DKIM Resend</strong> : deja gere par l'Action 1 (3 records CNAME).</li>
</ol>

<p><strong>DMARC (un record TXT)</strong> :</p>
<pre style="background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 4px; font-size: 12px;">Nom    : _dmarc.caftanfactory.com
Type   : TXT
Valeur : v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@caftanfactory.com; pct=100; adkim=s; aspf=s</pre>
<p>Note : <code>p=quarantine</code> au debut, on peut passer a <code>p=reject</code> apres 1-2 mois de monitoring sans incident. Crees une boite <code>dmarc-reports@caftanfactory.com</code> pour recevoir les rapports d'agregation des FAI.</p>

<p><strong>Livrable :</strong> me confirmer l'ajout des records (SPF, DKIM x2, DMARC) + screenshot du DNS. Verification possible avec <a href="https://mxtoolbox.com/SuperTool.aspx">mxtoolbox.com</a> (entrer "caftanfactory.com" + "txt lookup" et "dmarc lookup").</p>

<h2 style="color: #b45309; margin-top: 28px; font-size: 19px; border-bottom: 2px solid #fed7aa; padding-bottom: 4px;">⚙️ ACTION 4 — (Si tu peux) Aider sur le PAT GitHub avec scope <code>workflow</code> (PRIORITE MOYENNE, 5 min)</h2>

<p><strong>Pourquoi :</strong> nous avons 33 tasks automatises (sync candidats Gravity Forms, scoring, anomaly scan, IMAP polling fiches paie, daily reminders, rgpd anonymize, etc.) qu'on doit declencher via GitHub Actions toutes les X minutes/heures. Le fichier YAML est ecrit en local mais le push est bloque car le Personal Access Token de Karim n'a pas la permission <code>workflow</code>.</p>

<p><strong>Comment</strong> (deux options, choisis celle qui te parle) :</p>
<ol>
  <li><strong>Option A</strong> : Karim regenere son PAT lui-meme. Tu peux juste lui rappeler la procedure : <a href="https://github.com/settings/tokens">github.com/settings/tokens</a> > Generate new token (classic) > cocher <code>repo</code> + <code>workflow</code> > Save.</li>
  <li><strong>Option B</strong> : si tu es admin de l'organisation GitHub <code>Elbakr</code> ou collaborateur du repo <code>Formulaire_candidats</code>, tu peux pull la branche et push toi-meme le fichier <code>.github/workflows/caftan-crons.yml</code> avec ton propre PAT. Repo : <a href="https://github.com/Elbakr/Formulaire_candidats">github.com/Elbakr/Formulaire_candidats</a>, branche <code>caftan-rh-v2-prod</code>.</li>
</ol>

<p>Aussi : ajouter le secret <code>CRON_SECRET</code> aux GitHub Actions secrets : <a href="https://github.com/Elbakr/Formulaire_candidats/settings/secrets/actions">repo Settings > Secrets and variables > Actions</a> > New repository secret. La valeur est dans le <code>.env.local</code> de Karim (variable <code>CRON_SECRET</code>) ou recuperable via <code>npx vercel env pull</code>. Sans ce secret, les crons ne peuvent pas s'authentifier sur Vercel.</p>

<p><strong>Livrable :</strong> workflow push + secret configure. Verification : aller sur <a href="https://github.com/Elbakr/Formulaire_candidats/actions">repo Actions tab</a>, le workflow "caftan-rh-crons" doit apparaitre et tu peux le "Run workflow" en manuel pour tester.</p>

<h2 style="color: #475569; margin-top: 28px; font-size: 19px; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px;">📊 ACTION 5 — (Bonus, plus avance) Google Postmaster Tools (PRIORITE BASSE, 10 min)</h2>

<p><strong>Pourquoi :</strong> une fois les volumes d'envoi qui augmentent (centaines de mails/jour avec les candidats, fiches paie, etc.), il devient critique de monitorer la reputation domaine pour eviter le blacklisting et detecter tot les soucis de delivrability.</p>

<p><strong>Comment :</strong></p>
<ol>
  <li>Aller sur <a href="https://postmaster.google.com">postmaster.google.com</a></li>
  <li>"Add a domain" > <code>caftanfactory.com</code></li>
  <li>Verifier via un TXT record DNS (ils fournissent la valeur exacte)</li>
  <li>Accumuler 2-4 semaines de donnees pour avoir les dashboards (reputation IP, taux de spam reporte, authentification SPF/DKIM, etc.)</li>
</ol>

<p><strong>Livrable :</strong> confirmer la verification + me partager l'acces lecteur a Karim (qui peut surveiller la metric chaque mois).</p>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">💬 Notes sur les notifications push (non-Ali, pour info)</h2>

<p>L'app a un systeme de push notifications PWA (cles VAPID configurees, service worker en place a <code>${PROD}/sw.js</code>, table <code>push_subscriptions</code> avec 2 abonnements actifs : iPhone via Apple Push + Chrome Windows via FCM Google).</p>

<p>Diagnostic effectue ce soir : <strong>les 2 abonnements n'ont JAMAIS recu un push (<code>last_used_at = null</code> partout) bien que la table <code>notifications</code> contient 6868 entrees</strong>. Conclusion : c'est un <strong>bug applicatif</strong> — le code qui insere des notifications oublie d'appeler <code>sendPushToProfile()</code> apres. Karim doit fixer ca cote code, pas d'action infra requise de ta part.</p>

<p>Toutefois, deux verifications cote Workspace pourraient confirmer qu'il n'y a pas un blocage cote Google :</p>
<ul>
  <li>S'assurer que les comptes employes n'ont pas une politique CSP qui bloque les service workers du domaine <code>caftan-rh.vercel.app</code>. Workspace permet d'autoriser des "Trusted apps" par admin.</li>
  <li>Si on veut consolider les notifs (mail + push), s'assurer que Resend (Action 1) est verifie pour pouvoir envoyer les notifs critiques par mail aussi en fallback.</li>
</ul>

<h2 style="color: #0f172a; margin-top: 32px; font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">🎯 Recap synthetique des livrables attendus</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead><tr style="background: #f1f5f9;"><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Action</th><th style="text-align: left; padding: 8px; border: 1px solid #e2e8f0;">Livrable</th><th style="text-align: center; padding: 8px; border: 1px solid #e2e8f0;">Temps</th></tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">1. Resend domain verification</td><td style="padding: 8px; border: 1px solid #e2e8f0;">"Domain verified" sur dashboard Resend</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">10 min</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">2. App Password Gmail hr@</td><td style="padding: 8px; border: 1px solid #e2e8f0;">GMAIL_USER + GMAIL_APP_PASSWORD a Karim</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">5 min</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">3. SPF / DKIM / DMARC</td><td style="padding: 8px; border: 1px solid #e2e8f0;">4 records DNS + verif mxtoolbox</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">15 min</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">4. GitHub PAT workflow scope</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Workflow visible sur Actions tab + CRON_SECRET dans secrets</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">5 min</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;">5. Postmaster Tools (bonus)</td><td style="padding: 8px; border: 1px solid #e2e8f0;">Domain verified sur postmaster.google.com</td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">10 min</td></tr>
  </tbody>
</table>

<p style="margin-top: 24px;"><strong>Une fois les actions 1+2+3 faites, l'app sera 100% operationnelle</strong> sur les fonctions :</p>
<ul>
  <li>✅ Envoi automatique des mails candidats (acquittement, convocation, refus, offre) — Resend natif</li>
  <li>✅ Envoi des fiches de paie avec PDF natifs aux employes</li>
  <li>✅ Extraction automatique des fiches paie depuis hr@caftanfactory.com toutes les 30 min</li>
  <li>✅ Magic links de signature contrat qui arrivent en boite reception (pas spam)</li>
  <li>✅ Archivage automatique des contrats signes sur hr@caftanfactory.com</li>
  <li>✅ Reminders signature, dimona, formation, anniversaires VIP — par mail Resend natif</li>
</ul>

<p>L'action 4 (GitHub Actions) debloque les <strong>33 crons automatiques</strong> qui font tourner l'auto-pilote complet (sync candidats Gravity Forms, scoring, dimona reminder, leave balance, etc.). Sans ca, ces operations doivent etre declenchees manuellement.</p>

<p>Si tu as la moindre question sur l'une des etapes ou si tu vois une contrainte Workspace que je n'aurais pas anticipee, repond a Karim qui me transmettra.</p>

<p>Merci beaucoup Ali, on est tres proche d'avoir l'app a 100% pour le RH de Caftan Factory.</p>

<p style="margin-top: 24px;">Bien a toi,<br>
<strong>Karim Elbazi</strong><br>
<em>(redaction technique : Claude Code, assistant dev de Karim)</em></p>

<hr style="border: none; border-top: 2px solid #cbd5e1; margin: 32px 0;">

<p style="font-size: 12px; color: #64748b; font-style: italic;">
Karim : ce brouillon est envoye a tes 2 boites (elbazikarim@gmail.com + hr@caftanfactory.com) en redondance. Pour le forwarder a Ali : copie le bloc apres le hr ci-dessus, adapte la signature, et envoie depuis hr@caftanfactory.com (signe coherent avec le domaine).<br><br>
Heure d'envoi : 2026-06-08<br>
Diagnostic complet de l'app prod : <a href="${PROD}">${PROD}</a><br>
Commits de cette session : 8ceb8b7, 35f26c6, 39fbe72
</p>

</body></html>`;

const text = `[A FORWARDER A ALI]

Karim : ce mail est un brouillon a forwarder a Ali (admin domaine + Workspace caftanfactory.com).
Sujet propose : "Caftan HR — actions infra pour debloquer fonctionnalites manquantes".

---

Salut Ali,

J'ai deploye l'app RH Caftan HR en prod (${PROD}). Plusieurs fonctionnalites critiques sont HS car elles dependent d'infra que seul un admin du domaine peut configurer. C'est ta zone, j'ai liste 5 actions ci-dessous classees par criticite.

🔥 ACTION 1 — Verifier domaine caftanfactory.com sur Resend (10 min)
Pourquoi : Resend = service envoi mails transactionnels. Aujourd'hui mode "testing" -> tous mails aux candidats/employes externes bloques.
Comment : compte Resend (Karim t'invite), ajouter domaine caftanfactory.com, ajouter 3-5 records DNS (SPF, DKIM x3 CNAME, MX/TXT optionnel) chez le registrar, verifier sur Resend.
Livrable : "Domain verified" sur dashboard Resend.

🔥 ACTION 2 — App Password Google pour hr@caftanfactory.com (5 min)
Pourquoi : extraction auto fiches paie IMAP (cron 30 min, secretariats sociaux) + envoi SMTP Gmail natif (PJ binaires). Aujourd'hui 503 - env vars vides -> Karim gere 30+ fiches paie/mois manuellement.
Comment :
1. 2FA activee sur hr@caftanfactory.com
2. Admin Console > Apps > Google Workspace > Gmail > End User Access > "POP and IMAP Access" = ON
3. Login hr@ > myaccount.google.com/apppasswords > generer "Caftan HR App"
4. Transmettre a Karim : GMAIL_USER=hr@caftanfactory.com, GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
Alternative si bloque : Service Account avec delegation domain-wide (OAuth 2.0).

🔥 ACTION 3 — SPF/DKIM/DMARC pour caftanfactory.com (15 min)
Pourquoi : sans ca, mails sortants tombent en spam (Resend ET Gmail). Ruine experience utilisateur, critique fiches paie et magic links signature.
Comment :
- SPF (TXT a la racine) : v=spf1 include:_spf.google.com include:amazonses.com ~all
- DKIM Google : Admin Console > Apps > Workspace > Gmail > Authenticate Email > Generate + ajouter au DNS (google._domainkey.caftanfactory.com)
- DKIM Resend : deja gere par Action 1 (3 CNAME)
- DMARC (TXT _dmarc.caftanfactory.com) : v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@caftanfactory.com; pct=100; adkim=s; aspf=s
Livrable : confirmer ajout + verif mxtoolbox.com.

⚙️ ACTION 4 — PAT GitHub scope workflow (5 min, si tu peux)
Pourquoi : 33 crons auto (sync candidats, scoring, IMAP, reminders, etc.) via GitHub Actions. PAT Karim n'a pas scope workflow pour push le YAML.
Comment : soit Karim regenere son PAT, soit toi push le fichier .github/workflows/caftan-crons.yml depuis ton PAT (repo Elbakr/Formulaire_candidats, branche caftan-rh-v2-prod). Plus : ajouter secret CRON_SECRET aux GitHub Actions secrets (valeur dans .env.local Karim).

📊 ACTION 5 — Postmaster Tools Google (10 min, bonus)
Pourquoi : monitorer reputation domaine pour eviter blacklisting.
Comment : postmaster.google.com > Add a domain > caftanfactory.com > verifier TXT.

NOTE PUSH NOTIFICATIONS (non-Ali, pour info) :
2 abonnements actifs (iPhone + Chrome) mais last_used_at null partout. 6868 notifications en DB mais aucune jamais pushee. Bug applicatif (code oublie d'appeler sendPushToProfile), Karim doit fixer cote code.

RECAP livrables :
1. Resend "Domain verified" -- 10 min
2. GMAIL_USER + GMAIL_APP_PASSWORD a Karim -- 5 min
3. 4 records DNS SPF/DKIM/DMARC + verif mxtoolbox -- 15 min
4. Workflow visible sur GitHub Actions tab + CRON_SECRET -- 5 min
5. Postmaster verified -- 10 min (bonus)

Une fois 1+2+3 faits, l'app est 100% operationnelle sur : envois automatiques candidats (acquittement, convoc, refus, offre), fiches de paie PDF natives, extraction auto IMAP, magic links signature en boite reception, archivage hr@.

L'action 4 debloque les 33 crons automatiques (auto-pilote complet).

Si question ou contrainte Workspace, reponds a Karim qui me transmettra.

Merci Ali, on est proche du 100%.

Bien a toi,
Karim Elbazi
(redaction technique : Claude Code, assistant dev de Karim)`;

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
