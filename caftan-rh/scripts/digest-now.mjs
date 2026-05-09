#!/usr/bin/env node
// Trigger the digest cron locally — calls /api/cron/digest with the right Authorization.
// Usage : node scripts/digest-now.mjs [morning|evening]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const slot = process.argv[2] === "evening" ? "evening" : "morning";
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET missing in .env.local");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/cron/digest?slot=${slot}`;
console.log(`→ POSTing to ${url}`);

try {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log("Status:", res.status);
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error("Request failed:", e?.message ?? e);
  process.exit(1);
}
