// Agent : update kind='in' to 'out' pour les entries clairement mal attribuees
// (evening events qui devraient etre OUT mais ont ete attribuees IN parce que
// la journee n'avait pas encore d'IN au moment de l'insertion initiale).
//
// Approche : update ciblee par (employee, occurred_at) — pas de delete.
//
// Ces fixes sont SAFES car :
//  - L'employe a effectivement pointe a cet horaire (event Tuya reel)
//  - Le kind etait incorrect du a l'absence d'IN avant ce OUT
//  - On corrige juste le kind

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// Fix list : (employee_full_name, occurred_at, expected_kind)
// On ne touche QUE aux entries source='tuya' avec kind incorrect, ou ajoute
// le bon kind pour les events ou seul OUT a ete inserer comme IN.
//
// Pour chaque cas, on update via une condition unique (employee + occurred_at).

const fixes = [
  // Sanae 5/19 17:42 slot=112 IN -> OUT (paired with 08:34 IN slot 111)
  { name: "Sanae Asaidi", ts: "2026-05-19T17:42:22.000Z", to: "out" },
  // Omaima 5/19 18:00 slot=50 IN -> OUT (single event of day = end of shift)
  { name: "Omaima Ouahi", ts: "2026-05-19T18:00:15.000Z", to: "out" },
  // Selma 5/18 17:35 slot=55 IN -> OUT (paired with 07:50 IN slot 54)
  { name: "Selma Maïssa", ts: "2026-05-18T17:35:34.000Z", to: "out" },
  // Souad 5/17 17:58 slot=2 IN -> OUT
  { name: "Souad El Aissaouy", ts: "2026-05-17T17:58:46.000Z", to: "out" },
  // Hafsa 5/20 17:32 slot=94 IN -> OUT
  { name: "Hafsa Imachaal", ts: "2026-05-20T17:32:45.000Z", to: "out" },
  // Keltoum 5/17 17:57 slot=46 IN -> OUT
  { name: "Keltoum El Mrabet", ts: "2026-05-17T17:57:21.000Z", to: "out" },
];

for (const fix of fixes) {
  const r = await c.query(
    `update clock_entries
        set kind = $1
      where employee_id = (select id from employees where full_name = $2 limit 1)
        and occurred_at = $3
        and source = 'tuya'
        and kind != $1
      returning id, kind`,
    [fix.to, fix.name, fix.ts],
  );
  console.log(`${fix.name} @ ${fix.ts}: ${r.rowCount > 0 ? "fixed to " + fix.to : "no change (already correct or not found)"}`);
}

// Verify
console.log("\nVerify Sanae:");
const v = await c.query(`
  select occurred_at, kind, tuya_user_id, source
  from clock_entries ce
  join employees e on e.id = ce.employee_id
  where e.full_name = 'Sanae Asaidi' and occurred_at between '2026-05-19' and '2026-05-20'
  order by occurred_at
`);
for (const r of v.rows) console.log(`  ${r.occurred_at.toISOString()} ${r.kind} slot=${r.tuya_user_id} src=${r.source}`);

await c.end();
