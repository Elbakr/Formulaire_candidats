#!/usr/bin/env node
// Agent 2 (Prestations employé) — rapport de fin via EmailJS REST.
// Inspire de scripts/send-test-mail.mjs.

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

const subject = "CaftanRH — Agent 2 (Prestations employé) : terminé";

const body = `Salut Karim,

Agent 2 a livré la page Prestations par employé.

═════════ ACCÈS ═════════
URL : /planning/employees/<employeeId>/prestations?view=day
       /planning/employees/<employeeId>/prestations?view=week
       /planning/employees/<employeeId>/prestations?view=month

Le bouton "Prestations" est désormais visible sur la fiche employé,
à côté du bouton Calendrier (icône Activity).

Exemple en local (employé avec shifts + clock_entries) :
  http://localhost:3000/planning/employees/caf6615e-dc96-4e65-83da-2b02b1f180e7/prestations?view=day

═════════ FICHIERS CRÉÉS / MODIFIÉS ═════════

Créés :
  • src/app/planning/employees/[id]/prestations/page.tsx
  • src/app/planning/employees/[id]/prestations/prestations-view-tabs.tsx
  • scripts/send-agent2-report.mjs (ce script)

Modifiés :
  • src/app/planning/employees/[id]/page.tsx
    → ajout du bouton "Prestations" (icône Activity de lucide-react)
       dans la barre d'actions, à côté de "Calendrier".

═════════ FONCTIONNALITÉS LIVRÉES ═════════

KPIs (en haut de page, grid responsive md:2 / lg:4) :
  1. Heures planifiées  : somme amplitude (end_time - start_time) des shifts
                          de la période active.
  2. Heures effectuées  : somme (clock_out.occurred_at - clock_in.occurred_at)
                          pour chaque shift; affiche "+/- vs prévu" en sous-titre.
  3. Retards            : count(*) où clock_in > shift.start_time + 5 min;
                          affiche % de ponctualité.
  4. Absences           : count shifts terminés sans clock_in; affiche aussi
                          le nb de OUT manquants.

Vues :
  • Jour    : aujourd'hui par défaut, navigation prev/next ±1 jour.
  • Semaine : lundi-dimanche courant (startOfWeek de @/lib/planning),
              navigation ±7 jours.
  • Mois    : mois en cours, navigation ±1 mois.

Liste détaillée jour par jour :
  • 1 ligne par shift avec : site (chip code + couleur),
    horaires planifiés, IN réel, OUT réel,
    total heures (effectuées / planifiées), diff (+/-),
    badges (OK / Retard XXmin / OUT manquant / Absent / auto-OUT / À venir).
  • Les jours sans shift sont affichés "Repos" pour éviter les trous visuels.
  • La journée courante est surlignée gold-light.

Matching shifts ↔ clock_entries :
  • Direct via shift_id (cas standard).
  • Fallback "best-effort" pour les entries orphelins (shift_id NULL) :
    on les rattache au shift du même jour le plus proche (delta < 6h)
    qui n'a pas déjà de match. Utile pour les pointages legacy.

UI :
  • Card / Button / Badge venant de @/components/ui/*.
  • Icônes Activity / Clock / Timer / AlertTriangle / CheckCircle2 / XCircle
    de lucide-react.
  • Tokens couleur : gold-dark (titres), success / warn / danger (tons KPI),
    ink-2 / ink-3 (secondaire). Cohérent avec le reste de la fiche employé.
  • Mobile-first : grid 1 col → md 2 cols → lg 4 cols pour les KPIs ;
    flex-wrap partout pour les chips/badges.

Architecture :
  • Server Component pour la page (force-dynamic, revalidate=0).
  • Client Component dédié pour le toggle Jour/Semaine/Mois + nav prev/next.
  • Aucune nouvelle migration, aucun cron, aucune API route.
  • Auth : requireRole(["admin", "rh", "manager"]) (cohérent avec calendar).

═════════ TESTS EFFECTUÉS ═════════

  • npx tsc --noEmit : 0 erreur sur les nouveaux fichiers.
  • npx eslint sur src/app/planning/employees/[id]/prestations/ : 0 erreur.
  • curl sur les 3 vues (?view=day / week / month) en mode non authentifié :
    307 redirect vers /login (route correctement enregistrée, compile OK,
    aucun 500 côté Next).
  • Vérifié en DB qu'il existe des employés avec shifts ET clock_entries
    pour tester en vrai (ex: caf6615e-dc96-4e65-83da-2b02b1f180e7).
  • Le test manuel auth (login admin) reste à faire de ton côté
    (mots de passe non disponibles pour l'agent).

═════════ POINTS D'ATTENTION ═════════

1. Heures planifiées = amplitude (end - start), PAS amplitude - pause.
   Volontaire : on compare l'amplitude planifiée à l'amplitude effective
   (clock_in → clock_out). Si tu veux retirer les break_minutes du
   planifié, change shiftPlannedMinutes() dans page.tsx (ligne ~70).

2. La fenêtre de fetch couvre la période active + buffer (1j avant / 2j après)
   pour capturer les clock_entries en bord de période, pas 60j glissants
   stricts. Suffisant pour les 3 vues (jour, semaine, mois) car la borne
   max d'une vue est ~31 jours.

3. "Shift terminé" est défini par shift_end < now (nowMs capturé une fois
   au début du Server Component). Les shifts à venir affichent le badge
   "À venir" et ne sont pas comptés en absent / OUT manquant.

4. Le matching orphelin (shift_id NULL) est best-effort. Si tu veux
   plus strict, retire les blocs "attachOrphan(...)" dans page.tsx
   (~ligne 240).

5. Auto-OUT (auto_clocked_out = true) est badgé "auto-OUT" en muted,
   mais compté comme un OUT valide pour les heures effectuées.

À +,
Agent 2 (Prestations employé)
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
  console.log(`EmailJS HTTP status: ${res.status}`);
  console.log(`EmailJS response body: ${text}`);
  if (!res.ok) {
    console.log("\n--- FALLBACK: copier-coller dans Gmail ---\n");
    console.log("TO:", TO_EMAIL);
    console.log("SUBJECT:", subject);
    console.log("BODY:");
    console.log(body);
    process.exit(1);
  }
  console.log("\n=> 200 OK : mail envoyé à", TO_EMAIL);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
