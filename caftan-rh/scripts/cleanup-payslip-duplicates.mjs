#!/usr/bin/env node
// Karim 2026-05-31 : nettoyage chirurgical des doublons restants du
// batch 30/05 (fbc362b5) suite au redrop du 31/05 (094b374a).
// Transfere les statuts PAID des vieilles fiches vers les nouvelles
// equivalentes (meme employee+period+net), PUIS delete les vieilles.

import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const OLD_BATCH = "fbc362b5-4cf5-4dfb-996a-7a3460cc9f6c";
const NEW_BATCH = "094b374a";

// 1. Pour chaque vieille fiche paid, trouver la jeune equivalente et transferer le statut
const { rows: oldPaid } = await c.query(
  `select id, employee_id, period_year, period_month, net_amount, paid_at, paid_amount, payment_note
   from payslips where source_batch_id = $1 and payment_status = 'paid'`,
  [OLD_BATCH],
);
console.log(`${oldPaid.length} fiches PAID a transferer`);
for (const old of oldPaid) {
  const { rows: matches } = await c.query(
    `select id from payslips
     where source_batch_id::text like $1
     and employee_id = $2 and period_year = $3 and period_month = $4
     and abs(net_amount - $5) < 0.01 and payment_status != 'paid'
     limit 1`,
    [`${NEW_BATCH}%`, old.employee_id, old.period_year, old.period_month, old.net_amount],
  );
  if (matches.length === 0) {
    console.log(`  ⚠️  Aucune fiche equivalente pour vieille ${old.id.slice(0, 8)} - SKIP transfert`);
    continue;
  }
  const newId = matches[0].id;
  await c.query(
    `update payslips set payment_status='paid', paid_at=$2, paid_amount=$3,
     payment_note=coalesce(payment_note || ' | ', '') || 'transferred from ' || $4 || ' on dedup cleanup 2026-05-31'
     where id = $1`,
    [newId, old.paid_at, old.paid_amount, old.id.slice(0, 8)],
  );
  console.log(`  ✓ Statut paid transferé : ${old.id.slice(0, 8)} -> ${newId.slice(0, 8)}`);
}

// 2. Delete toutes les fiches du vieux batch (les non-paid + les paid transferees)
const { rowCount: deleted } = await c.query(
  `delete from payslips where source_batch_id = $1`,
  [OLD_BATCH],
);
console.log(`\n${deleted} fiches deletees du batch ${OLD_BATCH.slice(0, 8)}`);

// 3. Delete le batch lui-meme
await c.query(`delete from payslip_batches where id = $1`, [OLD_BATCH]);
console.log(`Batch ${OLD_BATCH.slice(0, 8)} delete`);

// 4. Verif finale
const { rows: total } = await c.query(`select count(*) as n from payslips`);
console.log(`\n=== TOTAL FINAL : ${total[0].n} payslips ===`);
const { rows: byStatus } = await c.query(
  `select payment_status, count(*) as n from payslips group by payment_status order by payment_status`,
);
for (const r of byStatus) console.log(`  ${r.payment_status} : ${r.n}`);

// Doublons restants ?
const { rows: dup } = await c.query(
  `select employee_id, period_year, period_month, net_amount, count(*) as n
   from payslips where employee_id is not null
   group by 1, 2, 3, 4 having count(*) > 1`,
);
if (dup.length > 0) {
  console.log("\n⚠️ DOUBLONS RESTANTS :");
  for (const r of dup) console.log(`  employee ${r.employee_id.slice(0, 8)} period ${r.period_year}-${r.period_month} net ${r.net_amount} x${r.n}`);
} else {
  console.log("\n✓ Aucun doublon restant");
}

await c.end();
