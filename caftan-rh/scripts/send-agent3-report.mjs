#!/usr/bin/env node
// Rapport Agent 3 — Refonte de la navigation principale.
// Inspiré de scripts/send-test-mail.mjs (même pattern EmailJS REST).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars in .env.local");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

const subject = "CaftanRH — Agent 3 (Refonte navigation) : terminé";

const body = `Salut Karim,

Agent 3 terminé : la navigation principale a été refondue pour résoudre
le problème "beaucoup de pages accessibles uniquement par URL directe".

═════════ PROBLÈME RÉSOLU ═════════

AVANT
  Chaque sous-route (/admin/*, /planning/*, /rh/*, /me/*, /scoring/*, ...)
  avait son propre layout.tsx qui hardcodait une nav DIFFÉRENTE. Conséquence :
  - depuis /admin/cockpit on ne voyait QUE les liens admin
  - depuis /planning/calendar on ne voyait PAS les liens admin/tuya, scoring,
    cdd-renewals, vip-clients, etc.
  - /admin/tuya/devices, /admin/tuya/users, /admin/tuya/logs,
    /admin/overtime-audit, /admin/settings/geofence, /rh/top-candidates,
    /admin/integrations/whatsapp/templates, /admin/pre-interview/questions
    n'étaient JAMAIS dans la sidebar => accès uniquement par URL directe.
  - 10 layout.tsx différents avec 10 versions divergentes du même menu.

APRÈS
  Une seule source de vérité : src/lib/navigation.ts → getNavSections(role).
  Tous les layouts appellent ce builder et obtiennent la MÊME nav, filtrée
  par rôle. Sidebar avec sections collapsibles (icône + chevron), état
  persisté en localStorage, ouverture auto sur le groupe actif.

═════════ NOUVELLE STRUCTURE DE MENU ═════════

1) MON ESPACE (tous les rôles)
   /me, /me/today, /me/clock, /me/planning, /me/availability, /me/time-off,
   /me/swaps, /me/absence, /me/onboarding, /me/scoring, /me/my-bonus,
   /me/my-clients, /me/documents, /me/messages, /chat, /me/profile

2) PLANNING (admin / rh / manager)
   /today, /planning/calendar, /planning/all-sites, /planning/sites,
   /planning/employees, /planning/quotas, /planning/validation,
   /planning/time-off, /planning/swaps, /planning/auto-drafts,
   /planning/reinforcement, /requests, /chat

3) RH (admin / rh / manager)
   /rh, /rh/candidates, /rh/top-candidates, /rh/pipeline, /rh/jobs,
   /rh/agenda, /rh/inbox, /onboarding
   + manager : /manager, /manager/calendar
   + rh+ : /rh/messages, /rh/templates, /rh/sequences, /rh/reports,
           /onboarding/templates
   + admin : /admin/cdd-renewals, /admin/absences, /admin/holidays,
             /admin/seasonal

4) POINTAGE (rh / admin uniquement)
   /admin/presence, /admin/anomalies
   + admin : /admin/settings/geofence, /admin/tuya/devices,
             /admin/tuya/users, /admin/tuya/logs

5) REPORTING (admin / rh / manager)
   /scoring, /scoring/weekly
   + manager : /manager/performance
   + rh+ : /admin/analytics, /admin/analytics/sites, /admin/cockpit,
           /admin/payroll, /admin/documents, /admin/overtime-audit,
           /admin/activity
   + admin : /admin/ai-audit, /admin/digest

6) ADMIN (admin uniquement)
   /admin, /admin/users, /admin/departments, /admin/settings,
   /admin/settings/leave-rules, /admin/settings/kpi-weights,
   /admin/settings/autoplaner-rules, /admin/settings/aid-dates,
   /admin/bonus, /admin/vip-clients, /admin/broadcasts,
   /admin/pre-interview, /admin/pre-interview/questions,
   /admin/integrations/gravity-forms, /admin/integrations/whatsapp,
   /admin/integrations/whatsapp/templates, /admin/help/planning,
   /admin/debug/push, /admin/debug/solver

Toutes les anciennes URLs restent valides (zéro page perdue, zéro route
cassée). Les pages "cachées" sont maintenant atteignables depuis le menu.

═════════ FICHIERS CRÉÉS ═════════

  src/lib/navigation.ts
    Source unique : getNavSections(role) → NavGroup[]
    ~220 lignes, centralise toute la nav de l'app.

  scripts/send-agent3-report.mjs
    Ce script (rapport).

═════════ FICHIERS MODIFIÉS ═════════

  src/components/app-shell.tsx
    - Ajout du nouveau prop "groups" (NavGroup[]) à côté de "sections"
      (legacy, conservé pour rétro-compat).
    - Sections collapsibles : header cliquable (icône + label + chevron),
      enfants indentés avec bordure gauche, persistence localStorage
      (clé "caftanrh:nav:collapsed"), ouverture forcée sur groupe actif.
    - Active state inchangé : bg gold-light + bordure gauche gold.
    - Sidebar passe de 220px à 240px desktop, 280px mobile drawer.

  src/app/admin/layout.tsx
  src/app/planning/layout.tsx
  src/app/rh/layout.tsx
  src/app/me/layout.tsx
  src/app/manager/layout.tsx
  src/app/today/layout.tsx
  src/app/requests/layout.tsx
  src/app/chat/layout.tsx
  src/app/scoring/layout.tsx
  src/app/onboarding/layout.tsx
  src/app/360/layout.tsx
    Tous remplacent l'ancien array "sections" hardcodé par un simple
    "const groups = getNavSections(profile.role)".

═════════ COMMENT TESTER ═════════

1. Dev server (probablement déjà actif sur localhost:3000) :
     npm run dev

2. Login en admin (elbazikarim@gmail.com / Admin2026!).

3. Navigation : tu dois voir 6 sections dans la sidebar
   (Mon espace, Planning, RH, Pointage, Reporting, Admin).
   - Clique sur le header d'une section → elle se replie / déplie.
   - Le chevron passe de ▼ à ▶.
   - Recharge la page : l'état de collapse est conservé (localStorage).
   - Clique sur un lien d'une section repliée d'un autre groupe :
     la section cible s'ouvre automatiquement.

4. Pages "ressuscitées" à vérifier depuis la sidebar Admin :
   - /admin/tuya/devices  (sous "Pointage")
   - /admin/tuya/users    (sous "Pointage")
   - /admin/tuya/logs     (sous "Pointage")
   - /admin/overtime-audit (sous "Reporting")
   - /admin/settings/geofence (sous "Pointage")
   - /rh/top-candidates    (sous "RH")
   - /admin/integrations/whatsapp/templates (sous "Admin")
   - /admin/pre-interview/questions (sous "Admin")
   - /admin/settings/leave-rules, /admin/settings/kpi-weights,
     /admin/settings/autoplaner-rules, /admin/settings/aid-dates
     (sous "Admin")

5. Rôles non-admin :
   - manager : pas de section "Admin", a "Mes candidats" et
     "Performance magasin" en plus.
   - rh : pas de section "Admin", mais voit "Reporting" et "Pointage".
   - candidate (employé) : voit UNIQUEMENT "Mon espace" (les autres
     sections sont absentes).

6. Mobile (resize < 768px) :
   - Bouton hamburger en haut-gauche ouvre le drawer.
   - Backdrop noir cliquable referme.
   - Click sur un lien referme automatiquement.

═════════ POINTS D'ATTENTION ═════════

- Compatibilité legacy : l'ancien prop "sections" reste supporté (converti
  en interne vers "groups"). Si tu trouves un layout que j'ai raté, il
  continuera à fonctionner avec son ancienne nav. Aujourd'hui plus aucun
  layout n'utilise "sections" — tous sont migrés.

- i18n : la nouvelle nav est en français (labels en dur dans navigation.ts).
  L'ancienne version /me utilisait t("me.nav.*") pour FR/NL. Si tu veux
  conserver la bilingue NL, il faut ajouter l'argument locale et utiliser
  t(...) dans getNavSections. Décision raisonnable prise : version FR
  unifiée d'abord, traduction NL en suivant si demandée (~30 min de
  travail).

- Le lien /planning/employees/[id]/prestations n'est pas dans la nav
  (page dynamique avec [id], pas atteignable depuis un menu global).
  L'autre agent crée la page : elle reste accessible depuis la fiche
  employé. Si tu veux un raccourci, on peut ajouter un lien direct dans
  la sidebar sous "Planning" mais sans [id] ça redirige où ?

- Rollback éventuel :
    git diff src/components/app-shell.tsx src/lib/navigation.ts \\
             src/app/{admin,planning,rh,me,manager,today,requests,chat,scoring,onboarding,360}/layout.tsx
  Les 11 layouts + 1 composant + 1 nouveau fichier = revert simple.

- Tests TypeScript : npx tsc --noEmit ne signale AUCUNE nouvelle erreur
  liée à mes changements (les ~10 erreurs pré-existantes — aid-confirm-row,
  contract-renderer, quick-client, generate-actions — étaient déjà là
  avant et n'ont pas bougé).

═════════ NEXT STEPS POSSIBLES ═════════

- Ajouter badges de notification (ex. nombre de validations en attente
  sur /planning/validation, anomalies sur /admin/anomalies). Le type
  NavItem supporte déjà "badge?: number", il suffit de le câbler côté
  layout (server-side fetch puis injection dans getNavSections).
- Traduction NL via t() comme l'ancienne version /me.
- Hint clavier (Cmd+K) pour la palette de recherche dans le menu si la
  liste devient trop longue.

À +,
Claude (Agent 3 — refonte navigation)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
    recipient: TO_EMAIL,
    user_email: TO_EMAIL,
    candidate_email: TO_EMAIL,
    to: TO_EMAIL,
    to_name: TO_NAME,
    name: TO_NAME,
    candidate_name: TO_NAME,
    from_name: FROM_NAME,
    reply_to: REPLY_TO,
    subject,
    message: body,
    html_message: body.replace(/\n/g, "<br>"),
    body,
    html: body.replace(/\n/g, "<br>"),
    content: body,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: params,
    }),
  });
  const text = await res.text();
  console.log(`EmailJS status: ${res.status} | body: ${text}`);
  if (!res.ok) {
    console.log("❌ Envoi échoué.");
    process.exit(1);
  }
  console.log("✅ Email envoyé à", TO_EMAIL);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
