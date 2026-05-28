// Karim 2026-05-24 : keeper local qui appelle tuya-poll + tuya-auto-out
// toutes les 5 minutes. Equivalent du cron Vercel pour le dev local.
//
// Usage : node scripts/cron-keeper.mjs
// Arret : Ctrl+C
//
// Logs : stdout (timestamp + JSON resume).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;
const INTERVAL_MS = 5 * 60_000; // 5 min

if (!SECRET) {
  console.error("CRON_SECRET manquant dans .env.local");
  process.exit(1);
}

async function callCron(path, label) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const body = await r.text();
    const ms = Date.now() - t0;
    let summary;
    try {
      const j = JSON.parse(body);
      summary = JSON.stringify({
        inserted: j.entries_inserted,
        skipped: j.skipped_no_mapping,
        closed: j.auto_closed,
        errors: j.errors?.length,
      });
    } catch { summary = body.slice(0, 80); }
    console.log(`[${new Date().toLocaleTimeString("fr-BE")}] ${label} (${r.status}, ${ms}ms) ${summary}`);
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString("fr-BE")}] ${label} ERREUR : ${e.message}`);
  }
}

async function tick() {
  await callCron("/api/cron/tuya-poll", "poll");
  await callCron("/api/cron/tuya-auto-out", "auto-out");
}

console.log(`Cron keeper start (interval ${INTERVAL_MS / 60_000} min)`);
await tick(); // run immediately
setInterval(tick, INTERVAL_MS);
