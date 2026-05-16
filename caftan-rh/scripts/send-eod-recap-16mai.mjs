#!/usr/bin/env node
// Karim 16/05 fin de journee : mail recap complet, URLs, taches, bugs, couts.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = "CaftanRH";
const REPLY_TO = "hr@caftanfactory.com";

const TUNNEL = "https://ear-external-intimate-wednesday.trycloudflare.com";
const REPO = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Rapport fin de journee 16 mai (URLs + taches + couts)";

const body = `Salut Karim,

Rapport complet de la journee.

== URL TEST IPHONE ==
${TUNNEL}
(Safari, login admin. Cloudflared verifie HTTP 200.)

== 10 FIXES PUSHES AUJOURD HUI (caftan-rh-v2-prod) ==

c4ecc05 solver : ordre chronologique strict lundi->dimanche (les
        jours speciaux ne saturent plus les quotas en 1er)
7377729 holidays : bonnes dates Pentecote (25/05 staff_mult 1.5)
        + Aid al-Adha j-1 (25/05 mult 2.0) + Aid (26/05 ferme)
        + Aid j+1 (27/05 mult 1.5). Fix fuseau diag scripts.
ad49178 solver : combinedMult plafond 2.0 + MAX au lieu de PRODUCT
        (avant : holiday x crescendo x pont x seasonal -> x4 cap
        -> 16 employes vises -> tout sur 1 site)
        + colonnes Vue ensemble 220px -> 140px (6 sites sur 1280).
f4200ca solver : batch awareness multi-sites. Le solveur de chaque
        site est averti des drafts deja places sur les sites
        precedents du batch via additionalExistingShifts.
18d4e64 planning : bouton "Generer la semaine" pointe sur le
        dialog multi-sites (avant : ouvrait le solver LEGACY qui
        skippait TOUS les feries priority>=2). Fix aussi affichage
        "3.9166666666666665h" -> "3.92h".
f4c1b33 solver : boost +1 par besoin (au lieu de need x mult).
e98e72d solver MAJEUR : besoins imbriques traites comme couches.
        Diag : site B a 3 site_needs imbriques le lundi (10:30-19:30
        head=2, sous-slot 12:30-18:30 head=1, sous-slot 14:30-17:30
        head=1). Solver les comptait independamment = 7 employes
        au lieu de 3-4. Fix alreadyCoveringNeed : si shifts deja
        places englobent le creneau, skip.
1e81faa scripts diag/clear semaine.
22b8d48 GF sync : query existing par batches de 500 + fallback
        per-row sur insert + dedupe in-batch par String(gf_entry_id).
        Bug : Supabase .in() avec 1823 ids -> seulement 1000 matches
        -> insert crash duplicate. Restauration confirmee : 1
        nouveau candidat synchronise il y a 10 min.

== EFFET ATTENDU sur 25-31 mai ==

Tu visais lundi 25 : A=4.5  B=4  D=2.5  E=4.5  (total 15.5).
Apres fix alreadyCovered + boost +1 :
 - A : 1-2 emp (need=1 + sous-slot couvert)  -- EN DECA
 - B : 2-3 emp (need=2 + boost)               -- OK
 - D : 1-2 emp                                -- EN DECA
 - E : 1-2 emp                                -- EN DECA

Pour atteindre 4.5/4/2.5/4.5, soit augmenter manuellement
site_needs.headcount sur le slot principal LUNDI pour A, D, E,
soit implementer un mecanisme "overrides par date".

J ai videz pour toi la semaine 25-31 mai en DB. Tu peux regenerer.

== BUGS NON RESOLUS ==

A. Doublons candidates GF (Kenza, Fatima 2x). Pas dedupliques auto.
B. Prayer pause cree 2 demi-shifts visibles dans la preview --
   pas un bug, mais affichage confus (a grouper).
C. Hard cap weekly_hours peut bloquer le boost +1 si l employe est
   deja sature ailleurs dans la semaine.
D. site_needs.is_additive absent : pas de distinction "renfort"
   (additif) vs "besoin de base" (absolu). Le fix alreadyCovered
   suppose tout est "absolu/imbrique".
E. Le ",5" mi-temps n est pas modelise -- besoin d un site_needs
   court (3-6h) distinct.

== TACHES A PREVOIR ==

1. site_needs.is_additive (1-2h) : colonne + UI + solver.
2. site_needs overrides par date (4-6h) : surcharge par jour ferie.
3. Dedupe automatique candidates (2h).
4. Preview shifts groupes par employe (2h).
5. Bouton "Vider + regenerer" combine (1h).
6. Validation post-generation UI (3-4h).
7. OT phase 2 boost crescendo (2h).
8. Tests Vitest solver (1-2 jours) -- la complexite merite ca.

== COUTS ==

Base 90 EUR/h hors taxes.

  15 mai : ~10h  -> ~900 EUR
            refactor solver phase 1+2, 14/28 regles autoplaner
            wired, role managers, detection pont, dates holidays.

  16 mai : ~10h  -> ~900 EUR
            alreadyCovered, batch awareness multi-sites, combinedMult
            MAX cap 2.0, multi-sites button, GF sync fix, scripts.

  Cumul (15+16 mai) : ~20h  -> ~1800 EUR HT

Facture proforma detaillee par commit dispo sur demande.
Delai de paiement suggere : 30 jours net (freelance BE).
Modalite virement, IBAN sur demande.

Si tu prefer un forfait au projet plutot que l horaire, on en
discute -- le perimetre s elargit (multi-sites, regles, validations,
GF, scoring, ponctualite, PWA, tunnels iPhone).

== AGENT DEBUG EN ARRIERE-PLAN ==

J ai lance un agent IA en autonomie : tsc + lint + audit routes
localhost:3000 + check holidays + test pont detection + liste
doublons + fix bugs trouves + mail separe. Tu vas recevoir son
mail d ici 20 min, en plus de celui-ci.

== ETAT TECHNIQUE ==

 - TypeScript : tsc --noEmit OK.
 - Tunnel : HTTP 200.
 - GF sync : OK, 1 candidat sync il y a 10 min.
 - DB semaine 25-31 mai : videe, pret a regenerer.
 - Build prod : pas teste (dev en cours). Dis-moi si tu veux deployer.

== SUIVI ==

Repo : ${REPO}
Tunnel : ${TUNNEL}

Bonne soiree.
Claude (CaftanRH builder)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
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
  console.log(`Status: ${res.status} | body: ${text}`);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
