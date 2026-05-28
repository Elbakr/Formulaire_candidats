// Karim 2026-05-24 : recap session "accents + traduction NL".
// Audit complet UTF-8 sur src/**/*.ts(x), fix des fichiers corrompus,
// extension du dictionnaire i18n (FR + NL).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

if (!SERVICE || !TEMPLATE || !PUBLIC_KEY) {
  console.error("EmailJS env manquant (SERVICE/TEMPLATE/PUBLIC_KEY)");
  process.exit(1);
}

const TUNNEL = "https://caftanrh.loca.lt";

const body = `Salut Karim,

Recap session "accents + traduction NL" ce soir.

===== 1. Caracteres accentues =====

Audit complet sur src/**/*.ts(x) :
  - Scan de tous les caracteres U+FFFD (le remplacement char "?")
  - Scan des sequences Latin-1 mojibake (Ã©, Ã¨, Ã , Ã§, etc.)
  - Verification UTF-8 stricte de tous les fichiers (encoding valide)
  - Verification absence de BOM (aucun fichier avec BOM detecte)

2 fichiers contenaient des caracteres corrompus (22 occurrences au total) :

(a) src/app/planning/sites/[code]/incoherence-banner.tsx (11 fixes)
    Avant -> Apres
    - "Re?oit les donnees"     -> "Reçoit les donnees"
    - "Incoh?rences d?tect?es" -> "Incohérences détectées"
    - "non-affect?s"           -> "non-affectés"
    - "employ?s ... pioch?s"   -> "employés ... piochés"
    - "Fausses pr?sences"      -> "Fausses présences"
    - "affich?s"               -> "affichés"
    - fallback name "?"        -> "?" (caractere ASCII normal)

(b) src/app/planning/employees/[id]/calendar/site-stats-panel.tsx (11 fixes)
    Avant -> Apres
    - "Re?oit les donnees"     -> "Reçoit les donnees"
    - "cr?neaux"               -> "créneaux"
    - "Heures planifi?es"      -> "Heures planifiées"
    - "Shifts cr??s"           -> "Shifts créés"
    - "Cr?neaux manquants"     -> "Créneaux manquants"
    - "Sous-utilis?s"          -> "Sous-utilisés"
    - "Satur?s / OT"           -> "Saturés / OT"
    - "En cong?"               -> "En congé"
    - badges value/separator   -> "−" (moins) "✓" (check) "→" (fleche) "∞" (infini)

Sanity checks effectues :
  - npx tsc --noEmit : pas d erreur nouvelle (les erreurs restantes sont
    pre-existantes dans aid-confirm-row, template-actions, etc — pas liees)
  - GET http://localhost:3000/ -> 200
  - GET http://localhost:3000/admin/presence -> 307 (redirect auth, OK)
  - GET http://localhost:3000/planning/employees -> 200

Aucun autre fichier source ne contient de U+FFFD ou de mojibake.

===== 2. Traduction neerlandaise =====

Systeme i18n trouve : src/lib/i18n.ts (deja en place, FR + NL, ~340 cles).
Hook client : src/hooks/use-locale.ts. Hook server : src/lib/locale-server.ts.
Toggle UI : src/components/lang-toggle.tsx (dans app-shell, donc visible
partout, pas seulement /me).

IMPORTANT : le commentaire d en-tete du module i18n precise explicitement :
  "Perimetre strict : /me/* + page candidat publique. Le back-office RH/admin
   reste FR (cf. CLAUDE.md / MASTER_SPEC.md 'bilingue UI utilisateur final')."

Donc les pages admin/RH (incluant /admin/tuya/*, /admin/presence,
/planning/employees/[id]/prestations) ont des labels hardcodes en FR par
design. Je n ai pas casse cette decision arch — je l ai respectee.

Cles ajoutees dans i18n.ts (FR + NL) :
  - me.nav.my_bonus           : "Mes primes" / "Mijn premies"
    (lien /me/my-bonus ajoute recemment dans navigation.ts)
  - me.nav.my_clients         : "Mes clientes VIP" / "Mijn VIP-klanten"
    (lien /me/my-clients ajoute recemment dans navigation.ts)
  - nav.section.me            : "Mon espace" / "Mijn ruimte"
  - nav.section.planning      : "Planning" / "Planning"
  - nav.section.rh            : "RH" / "HR"
  - nav.section.pointage      : "Pointage" / "Tijdregistratie"
  - nav.section.reporting     : "Reporting" / "Rapportage"
  - nav.section.admin         : "Admin" / "Admin"

Total : 8 nouvelles cles x 2 langues = 16 entrees ajoutees.

NB : ces cles ne sont PAS encore consommees par navigation.ts ni par
app-shell.tsx (qui passe les labels en plain string). Pour les activer
cote candidate (seul role qui a besoin de NL pour la nav), il faudrait
soit : (a) passer la locale en arg a getNavSections(role, locale), (b)
remplacer les labels par des cles de traduction et resoudre cote shell.
J ai prefere ne pas refacto navigation.ts ce soir car la nav est utilisee
partout — un crash = toute l app cassee (cf ta consigne). Les cles sont
deja dans i18n.ts pour quand tu veux brancher.

Termes incertains qui restent en FR (a valider) :
  - "Mes clientes VIP" -> j ai mis "Mijn VIP-klanten" (genere "klanten"
    qui est neutre, pas genre. "klantinnen" existe mais peu utilise en
    Belgique). A valider avec un native speaker.
  - "Renfort" -> "Versterking" deja en place dans la nav me, je n ai pas
    touche.
  - "Pointage" (section nav) -> "Tijdregistratie" (officiel BE) mais
    "Inklokken" est plus naturel. J ai garde "Tijdregistratie" pour la
    section nav (terme administratif) et "Inklokken" pour l action /me/clock
    (terme employe). Si tu preferes uniformiser, dis-moi.

===== 3. Backoffice admin (intentionnellement FR) =====

Les textes recents que tu as listes mais qui restent FR (par design i18n) :
  - /planning/employees/[id]/prestations : titres, KPIs, badges, vues
    (Jour/Semaine/Mois)
  - /admin/tuya/devices, /admin/tuya/users, /admin/tuya/logs : tous les
    titres, boutons (Enroler, Rafraichir depuis Tuya, Backfill, Forcer OUT)
  - /admin/presence : titres et boutons

Si tu veux finalement bilinguiser ces pages aussi, fais-moi signe — c est
un travail de refacto plus large (passer chaque label par t(...)) qui
sort du scope "session du soir".

===== 4. Liens deep pour tester =====

* Banner d incoherences sites (verifier accents) :
  ${TUNNEL}/planning/sites/SAB           # ou n importe quel code site

* Panneau stats site sur fiche employe (verifier "Heures planifiees",
  "Crenaux manquants", "Sous-utilises", "Saturés", "En congé") :
  ${TUNNEL}/planning/employees/<un-id>/calendar?date=2026-05-25

* Toggle FR/NL (en haut a droite du header partout) :
  ${TUNNEL}/me/today
  ${TUNNEL}/me/clock
  ${TUNNEL}/me/availability
  ${TUNNEL}/me/time-off

* Pages admin/Tuya (restent FR par design) :
  ${TUNNEL}/admin/tuya/users
  ${TUNNEL}/admin/tuya/devices
  ${TUNNEL}/admin/tuya/logs
  ${TUNNEL}/admin/presence

* Prestations employes (reste FR par design) :
  ${TUNNEL}/planning/employees/1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8/prestations?view=week

===== Comment basculer en NL =====

Le LangToggle est dans app-shell (visible partout) : 2 lettres FR/NL en
haut a droite, a cote du bell. Click sur NL :
  1. set le cookie "lang=nl" via server action
  2. update profiles.language_preference (persisted)
  3. router.refresh() pour re-render

Les pages /me/* repondent au toggle, les pages back-office restent FR.

===== Statut email =====

Code HTTP EmailJS confirme ci-dessous (200 attendu).

A demain,
Claude
`;

const params = {
  service_id: SERVICE,
  template_id: TEMPLATE,
  user_id: PUBLIC_KEY,
  accessToken: PRIVATE_KEY,
  template_params: {
    to_email: "elbazikarim@gmail.com",
    to_name: "Karim",
    subject: "CaftanRH — Accents + traduction NL : terminé",
    message: body,
  },
};

const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", origin: "http://localhost" },
  body: JSON.stringify(params),
});
console.log("Status:", res.status);
console.log("Body:", await res.text());

if (res.status !== 200) {
  console.log("\n=== BACKUP CONTENU MAIL (a copier-coller si EmailJS fail) ===");
  console.log(body);
}
