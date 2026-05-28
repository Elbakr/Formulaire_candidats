// Reset tuya_sync_state last_log_access_time to 2026-05-01
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const may1 = new Date("2026-05-01T00:00:00Z").getTime();

const r = await c.query(
  `update tuya_sync_state
      set last_log_access_time = $1, last_error = null
    where id in ('bfb90ad2054971aefatjkh', 'bfd90b87c696ead286zzxm')
    returning id, last_log_access_time`,
  [may1],
);
console.log("Reset sync state:");
for (const row of r.rows) {
  console.log(`  ${row.id} -> ${new Date(Number(row.last_log_access_time)).toISOString()}`);
}

await c.end();
