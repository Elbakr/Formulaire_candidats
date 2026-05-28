// Karim 2026-05-24 : diag pourquoi le link bleu sur le nom employe disparait.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== Mappings Pointage A avec slot rempli (tuya_user_id non null) ===");
const r = await c.query(`
  select m.tuya_user_id, m.tuya_user_id_alpha, m.employee_id, m.direction, m.is_active,
         e.full_name, e.status
  from tuya_user_mapping m
  left join employees e on e.id = m.employee_id
  where m.tuya_device_id = 'bfb90ad2054971aefatjkh'
    and m.is_active = true
  order by m.tuya_user_id nulls last
`);
console.log(`Total : ${r.rows.length}`);
for (const row of r.rows) {
  console.log(`  slot=${String(row.tuya_user_id ?? "—").padStart(4)} | alpha=${row.tuya_user_id_alpha ?? "—"} | dir=${row.direction} | emp=${row.employee_id?.slice(0,8) ?? "NULL"} | ${row.full_name ?? "?"}`);
}

await c.end();
