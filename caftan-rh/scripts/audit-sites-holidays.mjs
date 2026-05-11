// Audit lecture seule : sites, holidays, site_needs.
// Sert à planifier les regles "jours feries + creneaux critiques".

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: sites } = await c.query(
  `select id, code, name, address, color, is_active, created_at from sites order by code`,
);
console.log("\n=== SITES ===");
for (const s of sites) {
  console.log(` ${s.code} | ${s.name} | active=${s.is_active} | addr=${s.address ?? "—"} | color=${s.color ?? "—"}`);
}

const { rows: needs } = await c.query(
  `select s.code as site_code, n.day_of_week, n.start_time, n.end_time, n.headcount, n.role
   from site_needs n join sites s on s.id = n.site_id
   order by s.code, n.day_of_week, n.start_time`,
);
console.log(`\n=== SITE_NEEDS (${needs.length}) ===`);
const days = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
for (const n of needs) {
  console.log(` ${n.site_code} | ${days[n.day_of_week]} ${n.start_time.slice(0,5)}-${n.end_time.slice(0,5)} | hc=${n.headcount} | role=${n.role ?? "—"}`);
}

const { rows: hol } = await c.query(
  `select date, label, kind, priority, country, is_active
   from holidays
   where date >= current_date and date <= current_date + 365
   order by date
   limit 30`,
);
console.log(`\n=== HOLIDAYS prochaines (${hol.length}) ===`);
for (const h of hol) {
  console.log(` ${h.date instanceof Date ? h.date.toISOString().slice(0,10) : h.date} | ${h.label} | ${h.kind} | prio=${h.priority} | ${h.country ?? ""} | active=${h.is_active}`);
}

const { rows: cols } = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_name = 'holidays' order by ordinal_position
`);
console.log("\n=== holidays colonnes ===");
for (const c of cols) console.log(` ${c.column_name} : ${c.data_type}`);

await c.end();
