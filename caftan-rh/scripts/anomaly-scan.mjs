#!/usr/bin/env node
// Manual anomaly scan trigger — calls the cron route locally with the
// CRON_SECRET. Useful pour smoke-tester sans attendre l'horaire vercel.
//
// Usage : npm run anomaly:scan

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const baseUrl = process.env.PUBLIC_APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET missing in .env.local");
  process.exit(1);
}

const url = `${baseUrl}/api/cron/anomaly-scan`;
console.log("→ POST", url);

try {
  const r = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
  const text = await r.text();
  console.log(`status=${r.status}`);
  console.log(text);
  if (!r.ok) process.exit(1);
} catch (e) {
  console.error("Fetch failed:", e.message);
  process.exit(1);
}
