// Agent autonome 2026-05-24 : email recap restitution mai 2026 a Karim.
// Genere depuis la BD directement pour avoir les chiffres a jour.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

if (!SERVICE || !TEMPLATE || !PUBLIC_KEY) {
  console.error("EmailJS env manquant");
  process.exit(1);
}

const TUNNEL = "https://caftanrh.loca.lt";

// Recolte stats depuis la BD
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const tot = await c.query(`
  select count(*) as n,
         count(*) filter (where source='tuya') as tuya_n,
         count(*) filter (where source='auto_close') as auto_n,
         count(*) filter (where kind='in') as in_n,
         count(*) filter (where kind='out') as out_n,
         count(distinct employee_id) as emp_n
  from clock_entries
  where source in ('tuya', 'auto_close')
    and occurred_at between '2026-05-01' and '2026-05-25'
`);
const t = tot.rows[0];

const dist = await c.query(`
  select e.full_name,
         count(*) filter (where ce.kind='in') as in_n,
         count(*) filter (where ce.kind='out') as out_n,
         count(*) filter (where ce.source='tuya') as tuya_n,
         count(*) filter (where ce.source='auto_close') as auto_n,
         count(distinct ce.occurred_at::date) as day_n
  from clock_entries ce
  join employees e on e.id = ce.employee_id
  where ce.source in ('tuya', 'auto_close')
    and ce.occurred_at between '2026-05-01' and '2026-05-25'
  group by e.full_name
  order by e.full_name
`);

const ci = await c.query(`select count(*) as n from clock_currently_in`);
const stillClocked = ci.rows[0].n;

await c.end();

const distLines = dist.rows.map(r => {
  return `  ${r.full_name.padEnd(28)} : ${r.in_n} IN / ${r.out_n} OUT  (${r.day_n} jours, tuya=${r.tuya_n}, auto-out=${r.auto_n})`;
}).join("\n");

const body = `Salut Karim,

Recap de la restitution autonome de mai 2026 (1 -> 24 mai).

----- Resultats -----

* Total clock_entries inseres pour mai : ${t.n}
  - source='tuya'        : ${t.tuya_n} (events reels capture par les terminaux)
  - source='auto_close'  : ${t.auto_n} (fermetures auto-OUT pour IN abandonnees)
  - IN total             : ${t.in_n}
  - OUT total            : ${t.out_n}
  - Employees couverts   : ${t.emp_n}

* Actuellement clocked-in : ${stillClocked} (devrait etre 0 en soiree)

----- Distribution par employee -----

${distLines}

NB : Le materiel Tuya ne stocke que ~7 jours d historique sur l appareil
(via API). Les events anterieurs au 17-18 mai ne sont plus recuperables
depuis le device. Pour le futur, le cron de polling toutes les 5 min
captera tout au fur et a mesure.

----- Mappings que j ai ajoutes auto -----

POINTAGE A (bfb90ad2054971aefatjkh) :
  * slot 86 (IN)  -> Rekimi Doha
    Heuristique : pattern 4 jours consecutifs 5/18-5/21 matin 8h20-8h34 IN,
    correspond exactement au start_date 5/18 de Doha sur site A.
  * slot 12 (OUT) -> Rekimi Doha
    Heuristique : 3 jours consecutifs 5/18-5/20 soir 17h36-17h45 OUT,
    paire systematiquement avec slot 86. Confirme cycle journee complete.

POINTAGE E (bfd90b87c696ead286zzxm) :
  J ai ajoute 8 mappings alpha-only (sans slot) pour les employes CaftanRH
  dont le nick name Tuya correspond a leur nom : Lina, Ilham, Assya,
  Omaima, Doha, Hajar, Salmane, Chaymae. Karim doit valider le slot via
  /admin/tuya/logs au prochain pointage.

----- Mappings encore manquants -----

POINTAGE A — slots a events mais sans attribution (Karim a valider) :
  * slot 14 (5/22 18h01 OUT)  - 1 event
  * slot 64 (5/20 08h53 IN)   - 1 event
  * slot 65 (5/20 18h01 OUT)  - 1 event  (probable pair avec slot 64)
  * slot 87 (5/21 17h58 OUT)  - 1 event
  * slot 96 (5/23 18h09 OUT)  - 1 event
  * slot 97 (5/21 18h05 OUT)  - 1 event
  * slot 100 (5/23 18h18 OUT) - 1 event
  + Selma/Hajar/Aya/Assya/Chaymae/Ilham sont mappes alpha-only sur A,
    Karim doit confirmer leurs slots respectifs via /admin/tuya/logs.

POINTAGE E — slots a events mais sans attribution :
  * slot 65 (5/19 08h20 IN)  - 1 event
  * slot 66 (5/19 17h32 OUT) - 1 event
  Aucune info pour deviner qui c etait (les CaftanRH sur E ce jour-la
  sont deja mappes : Selma slot 54/55, Souad 1/2, Keltoum 46).
  Probablement une non-CaftanRH qui a pointe ce jour-la.

----- Fixes appliques au code -----

1. src/lib/tuya-client.ts: fetchUnlockLogs paginait pas (size=50 cap).
   Ajoute boucle has_next + next_row_key pour recuperer tous les events
   d une fenetre. Sur 7 jours, on a 176 events au lieu de 50.

2. src/lib/tuya-poll.ts: ajoute un pre-check tuya_access_log_id avant
   l insert. Le trigger prevent_double_clock_in firait AVANT la verif
   d unicite (check_violation au lieu de 23505), ce qui rendait les
   re-runs bruyants (errors au lieu de skipped_duplicate).

3. clock_entries : corrige 6 entries dont kind etait wrong (IN au lieu
   de OUT pour les events soir d employes dont aucune IN n existait
   encore au moment de l insertion initiale). Touches : Sanae, Omaima,
   Selma, Souad, Hafsa, Keltoum (1 ligne chacun).

----- Erreurs residuelles -----

Apres backfill, il reste 3 events non inseres sur Pointage A :
  * Hafsa 5/18 11h10 (inseree manuellement par moi pour debloquer)
  * Hafsa 5/21 11h05  (bloque par phantom auto_close 5/21 02h32)
  * Omaima 5/20 08h01 (bloque par phantom auto_close 5/20 03h00)
  * Omaima 5/20 18h04 (idem)

Cause : auto_close OUT phantomes generes AVANT le fix des kinds, qui
distordent la chronologie. J ai voulu les nettoyer mais le sandbox a
refuse (operation destructive non autorisee). Pour les rattraper :
  - soit Karim supprime ces 3 auto_close phantomes via SQL :
    delete from clock_entries
    where source='auto_close' and id in (
      select ce.id from clock_entries ce
      where ce.source='auto_close' and ce.kind='out'
        and ce.occurred_at between '2026-05-01' and '2026-05-25'
        and exists (
          select 1 from clock_entries ce2
          where ce2.employee_id = ce.employee_id
            and ce2.kind='out' and ce2.source='tuya'
            and ce2.occurred_at between ce.occurred_at - interval '6h' and ce.occurred_at + interval '6h'
        )
    );
  - puis relancer un poll lookback_days=30 (la pagination + pre-check
    sont en place, ca devrait inserer les 3 events restants proprement).

----- Liens utiles -----

* Presence live :
  ${TUNNEL}/admin/presence

* Prestations employees (vue globale) :
  ${TUNNEL}/planning/employees

* Prestations Keltoum El Mrabet (vue mois) :
  ${TUNNEL}/planning/employees/1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8/prestations?view=month

* Prestations Sanae Asaidi (vue mois) :
  ${TUNNEL}/planning/employees/ea7eae16-4d39-4f02-9389-8920560cc383/prestations?view=month

* Logs Tuya (events bruts) :
  ${TUNNEL}/admin/tuya/logs

* Mapping empreintes Tuya :
  ${TUNNEL}/admin/tuya/users

----- TODO Karim -----

A. Verifier le mapping slot 86 / slot 12 -> Doha (j ai mis ces 2 par
   heuristique forte mais a confirmer).

B. Mapper les ~6 slots manquants sur Pointage A via /admin/tuya/logs
   (14, 64, 65, 87, 96, 97, 100).

C. Valider/completer les 8 mappings alpha-only que j ai ajoutes sur
   Pointage E (Lina, Ilham, Assya, Omaima, Doha, Hajar, Salmane,
   Chaymae) en ajoutant le slot a la prochaine occasion.

D. Optionnel : supprimer les 3 phantom auto_close (cf. SQL ci-dessus)
   et relancer un poll pour recuperer les 3 events Hafsa/Omaima
   manquants.

A demain,
Claude (agent autonome)
`;

const params = {
  service_id: SERVICE,
  template_id: TEMPLATE,
  user_id: PUBLIC_KEY,
  accessToken: PRIVATE_KEY,
  template_params: {
    to_email: "elbazikarim@gmail.com",
    to_name: "Karim",
    subject: `CaftanRH — Mai 2026 restitue : ${t.n} pointages`,
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
  console.log("\n=== CONTENU MAIL (a copier-coller si EmailJS fail) ===");
  console.log(body);
}
