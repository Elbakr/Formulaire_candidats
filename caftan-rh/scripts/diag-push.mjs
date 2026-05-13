// Diagnostique le pipeline push.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

console.log("=== ENV VAPID ===");
console.log("VAPID_PUBLIC_KEY        :", process.env.VAPID_PUBLIC_KEY ? "OK (" + process.env.VAPID_PUBLIC_KEY.length + " chars)" : "MISSING");
console.log("VAPID_PRIVATE_KEY       :", process.env.VAPID_PRIVATE_KEY ? "OK (" + process.env.VAPID_PRIVATE_KEY.length + " chars)" : "MISSING");
console.log("NEXT_PUBLIC_VAPID_PUBLIC:", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "OK" : "MISSING");
console.log("VAPID_SUBJECT           :", process.env.VAPID_SUBJECT ?? "MISSING");

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log("\n=== push_subscriptions actives ===");
const { rows: subs } = await c.query(`
  select s.id, s.profile_id, s.user_agent, s.is_active, s.created_at, s.last_used_at,
         p.email, p.role, p.full_name
  from push_subscriptions s
  left join profiles p on p.id = s.profile_id
  order by s.created_at desc
  limit 20
`);
console.log(`Total : ${subs.length}`);
for (const s of subs) {
  const ua = (s.user_agent ?? "").substring(0, 50);
  console.log(`  ${s.is_active ? "✓" : "✗"} ${s.full_name ?? s.email} (${s.role ?? "?"}) | ${ua} | seen=${s.last_used_at ? new Date(s.last_used_at).toISOString().slice(0,16) : "—"}`);
}

console.log("\n=== Notifications kind=special_day_preview recentes ===");
const { rows: notifs } = await c.query(`
  select n.id, n.created_at, n.title, n.body, n.recipient_id,
         p.email, p.full_name
  from notifications n
  left join profiles p on p.id = n.recipient_id
  where n.kind = 'special_day_preview'
  order by n.created_at desc
  limit 5
`);
console.log(`Total : ${notifs.length}`);
for (const n of notifs) {
  console.log(`  ${new Date(n.created_at).toISOString().slice(0,16)} | ${n.full_name ?? n.email} | ${n.title}`);
}

await c.end();
