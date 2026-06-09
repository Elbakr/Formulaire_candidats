#!/usr/bin/env node
// Karim 2026-06-09 : test fin-a-fin du nouveau pipeline notif-push
// 1. Lit les profile_id avec push_subscriptions actives
// 2. INSERT une notif pour le 1er d'entre eux
// 3. Attends 4 sec
// 4. Verifie que push_subscriptions.last_used_at s'est mis a jour

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const l of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
  let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const subs = await c.query(`select s.id, s.profile_id, s.endpoint, s.last_used_at, p.email from public.push_subscriptions s left join public.profiles p on p.id = s.profile_id where s.is_active = true`);
console.log(`\n${subs.rows.length} push_subscriptions actives :`);
console.table(subs.rows.map(r => ({ profile_id: r.profile_id?.slice(0,8), email: r.email, endpoint_prefix: r.endpoint?.slice(8, 40), last_used_at: r.last_used_at })));

if (subs.rows.length === 0) {
  console.log("Aucun abonnement, impossible de tester");
  process.exit(0);
}

const targetProfileId = subs.rows[0].profile_id;
console.log(`\nINSERT notif test pour profile_id ${targetProfileId.slice(0,8)}... (${subs.rows[0].email ?? 'unknown'})`);
const ins = await c.query(`insert into public.notifications (recipient_id, kind, title, body, link, data) values ($1, $2, $3, $4, $5, $6) returning id, created_at`, [
  targetProfileId,
  "test_push_e2e",
  "Test push notification",
  "Si tu vois ceci sur ton appareil, le pipeline notif-push fonctionne 🎉",
  "https://caftan-rh.vercel.app/",
  { test: true, source: "test-notif-push.mjs" }
]);
const notifId = ins.rows[0].id;
console.log(`✅ Notif inseree id=${notifId.slice(0,8)} created_at=${ins.rows[0].created_at}`);

console.log("\nAttente 5 sec pour que le trigger + endpoint + push completent...");
await new Promise(r => setTimeout(r, 5000));

const after = await c.query(`select s.id, s.profile_id, s.endpoint, s.last_used_at, s.is_active from public.push_subscriptions s where s.profile_id = $1`, [targetProfileId]);
console.log(`\nEtat des subs apres test :`);
console.table(after.rows.map(r => ({ endpoint_prefix: r.endpoint?.slice(8, 40), last_used_at: r.last_used_at, is_active: r.is_active })));

// Verifier aussi le pg_net response queue
console.log("\nDernieres requetes pg_net (depuis 1 min) :");
try {
  const reqs = await c.query(`select id, created, request_id, status_code, content::text as body from net._http_response where created > now() - interval '2 minutes' order by created desc limit 5`);
  console.table(reqs.rows.map(r => ({ id: r.id, status: r.status_code, body: r.body?.slice(0, 80) })));
} catch (e) {
  console.log("(pg_net response queue pas accessible:", e.message.slice(0, 100), ")");
}

await c.end();
