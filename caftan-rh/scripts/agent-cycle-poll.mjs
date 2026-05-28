// Agent : cycle poll + auto-out jusqu a stabilisation
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

async function poll() {
  const r = await fetch("http://localhost:3000/api/cron/tuya-poll?lookback_days=30", {
    headers: { authorization: "Bearer " + process.env.CRON_SECRET },
  });
  const j = await r.json();
  return j;
}
async function autoOut() {
  const r = await fetch("http://localhost:3000/api/cron/tuya-auto-out", {
    headers: { authorization: "Bearer " + process.env.CRON_SECRET },
  });
  const j = await r.json();
  return j;
}

// Reset sync state before each cycle (otherwise lookback won t go back)
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
async function resetSync() {
  const may1 = new Date("2026-05-01T00:00:00Z").getTime();
  await c.query(`update tuya_sync_state set last_log_access_time = $1, last_error = null where id in ('bfb90ad2054971aefatjkh', 'bfd90b87c696ead286zzxm')`, [may1]);
}

let lastInserted = -1;
let stable = 0;
for (let i = 0; i < 10; i++) {
  console.log(`\n=== Cycle ${i + 1} ===`);
  await resetSync();
  const p = await poll();
  console.log(`  poll: inserted=${p.entries_inserted} skipped_no_mapping=${p.skipped_no_mapping} dup=${p.skipped_duplicate} errors=${p.errors.length}`);
  if (p.errors.length > 0) {
    // count error types
    const counts = {};
    for (const e of p.errors) {
      const m = e.match(/insert (.+?)\.?$/);
      const key = m ? m[1].slice(0, 50) : e.slice(0, 50);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const [k, n] of Object.entries(counts)) console.log(`    ${n}x: ${k}`);
  }
  const a = await autoOut();
  console.log(`  auto-out: closed=${a.auto_closed} scanned=${a.scanned} open_ins=${a.open_ins}`);
  if (p.entries_inserted === 0 && a.auto_closed === 0) {
    stable++;
    if (stable >= 2) {
      console.log("Stable, exiting");
      break;
    }
  } else {
    stable = 0;
  }
  lastInserted = p.entries_inserted;
}

await c.end();
