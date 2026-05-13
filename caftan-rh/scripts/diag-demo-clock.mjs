// Trace complete du pointage Demo Employee : clock_entries + coords GPS.
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

const { rows: emps } = await c.query(
  `select id, full_name from employees where full_name ilike '%demo%employ%' order by full_name`,
);
console.log("Employes Demo :", emps);

for (const e of emps) {
  console.log(`\n=== Clock entries ${e.full_name} (7 derniers jours) ===`);
  const { rows: entries } = await c.query(
    `select id, kind, occurred_at::text as t,
            geo_lat, geo_lng, geo_accuracy_m, is_anomalous, notes,
            selfie_storage_path, site_id
     from clock_entries
     where employee_id = $1 and occurred_at > now() - interval '7 days'
     order by occurred_at desc`,
    [e.id],
  );
  for (const r of entries) {
    const coords = r.geo_lat != null ? `${Number(r.geo_lat).toFixed(5)},${Number(r.geo_lng).toFixed(5)} ±${r.geo_accuracy_m ?? "?"}m` : "no GPS";
    const selfie = r.selfie_storage_path ? "📷" : "—";
    const anom = r.is_anomalous ? "⚠ANOMALY" : "";
    console.log(`  ${r.t.slice(0,16)} | ${r.kind.padEnd(11)} | ${coords} | ${selfie} ${anom} ${r.notes ? "// "+r.notes : ""}`);
  }
}

await c.end();
