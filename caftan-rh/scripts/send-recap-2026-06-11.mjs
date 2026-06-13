#!/usr/bin/env node
// Karim 2026-06-11 : envoie un mail recap des nouveautes + comment tester +
// login du compte employe de test. Via Resend.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL || "Caftan Factory <hr@caftanfactory.com>";
// Resend (mode test) n'autorise que l'adresse verifiee du compte.
const TO = "hr@caftanfactory.com";
if (!KEY) { console.error("RESEND_API_KEY manquant"); process.exit(1); }

const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5">
  <div style="background:#c9a34d;color:#1a1a0d;padding:20px 24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px">Caftan HR — Récap des nouveautés 🚀</h1>
    <p style="margin:6px 0 0;font-size:13px;opacity:.85">Session du 11 juin — tout est en ligne et s'auto-pilote.</p>
  </div>
  <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:20px 24px">

    <h2 style="font-size:16px;color:#c9a34d">🔐 Ton compte EMPLOYÉ de test</h2>
    <p style="font-size:14px">Pour tester le chat (format WhatsApp) et les notifs push à 2 comptes, depuis <b>ta même boîte mail</b> :</p>
    <table style="font-size:14px;background:#faf7ef;border-radius:8px;padding:8px;width:100%">
      <tr><td style="padding:4px 8px"><b>URL</b></td><td><a href="https://caftan-rh.vercel.app/login">caftan-rh.vercel.app/login</a></td></tr>
      <tr><td style="padding:4px 8px"><b>Email</b></td><td>elbazikarim+test@gmail.com</td></tr>
      <tr><td style="padding:4px 8px"><b>Mot de passe</b></td><td><i>(communiqué séparément — voir la sortie du script create-test-employee)</i></td></tr>
    </table>
    <p style="font-size:13px;color:#555"><b>Comment tester :</b> connecte-toi en <b>admin</b> (elbazikarim@gmail.com) sur ton ordi, et en <b>employé test</b> (ci-dessus) sur ton téléphone (ou un onglet privé). Un <b>chat DM</b> existe déjà entre les deux. Écris d'un côté → tu reçois sur l'autre : message live, double-coche bleue (lu), « écrit… », et <b>push</b> sur le téléphone si l'app est fermée. Tu peux aussi envoyer une <b>photo</b> 📷.</p>
    <p style="font-size:13px;color:#555">⚠️ Active les notifications quand l'app te le propose (bannière), pour recevoir les push.</p>

    <h2 style="font-size:16px;color:#c9a34d">✨ Ce qui est nouveau</h2>
    <ul style="font-size:14px;padding-left:18px">
      <li><b>Pointage fiabilisé</b> — Tuya = source de vérité, OUT oubliés auto-fermés, présence à jour. <i>Test : /admin/presence ou Centre RH.</i></li>
      <li><b>Heures à l'heure de Bruxelles</b> partout (avant c'était en UTC, −2h). <i>Test : regarde les heures de pointage/planning.</i></li>
      <li><b>Chat type WhatsApp</b> — temps réel, push, double-coche « lu », « écrit… », envoi de photos. <i>Test : avec le compte employé ci-dessus.</i></li>
      <li><b>Notifications cliquables</b> — un clic ouvre le détail complet (problème + solution). <i>Test : clique une notif dans la cloche ou /me/notifications.</i></li>
      <li><b>Centre RH</b> 🎛 — un écran d'accueil avec tes fonctions essentielles + un bouton « Toutes les fonctions ». <i>Test : menu → « 🎛 Centre RH » ou /rh/hub.</i></li>
      <li><b>Mobile plus rapide</b> — pages qui s'affichent instantanément (skeletons), dashboard /m accéléré. <i>Test : ouvre /m, /me/today sur ton téléphone.</i></li>
    </ul>

    <h2 style="font-size:16px;color:#c9a34d">🤖 Surveillance automatique (nouveau)</h2>
    <ul style="font-size:14px;padding-left:18px">
      <li><b>Agent de santé quotidien</b> — chaque matin, 1 notif « 🩺 Système » qui te liste les problèmes détectés + la solution de chacun.</li>
      <li><b>Alerte site vide</b> — si personne n'a badgé 5 min après l'ouverture d'un magasin → push urgent.</li>
      <li><b>Écarts d'heures hebdo</b> — chaque vendredi, les écarts pointé/planifié signalés.</li>
    </ul>

    <h2 style="font-size:16px;color:#c9a34d">🛠️ En coulisses</h2>
    <p style="font-size:13px;color:#555">Le déploiement et le pilote automatique (qui étaient cassés depuis des jours) sont réparés : chaque modif se met en ligne toute seule, et les crons (pointage, relances…) tournent à nouveau. 9 bugs d'affichage corrigés en plus.</p>

    <p style="font-size:12px;color:#999;margin-top:24px">Mail généré automatiquement — Caftan HR.</p>
  </div>
</div>`;

const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: [TO], subject: "Caftan HR — Récap des nouveautés + ton compte de test 🚀", html }),
});
const resBody = await r.json();
console.log("HTTP", r.status, JSON.stringify(resBody));
if (r.ok) console.log("✅ Mail recap envoye a", TO, "(from:", FROM + ")");
else console.log("❌ Echec envoi:", resBody?.message ?? "");
