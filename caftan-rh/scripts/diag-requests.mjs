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

const r1 = await c.query("select count(*) from chat_requests");
console.log("chat_requests count:", r1.rows[0].count);

const r2 = await c.query(`
  select id, room_id, author_profile_id, created_at, left(body, 80) as body_preview, attachments
  from chat_messages
  where attachments::text like '%chat_request%'
  order by created_at desc
  limit 10
`);
console.log("\nmessages with chat_request attachment:");
for (const row of r2.rows) console.log(" -", row.id, row.created_at.toISOString(), "|", row.body_preview);

const r3 = await c.query(`
  select id, room_id, kind, title, status, urgency, created_at, source_message_id
  from chat_requests
  order by created_at desc
  limit 10
`);
console.log("\nchat_requests rows:");
for (const row of r3.rows) console.log(" -", row.id, row.kind, "|", row.title, "| status:", row.status);

// Vérifier le room du message + members
const r4 = await c.query(`
  select cm.id as message_id, cm.room_id, cr.kind, cr.name as room_name,
         s.code as site_code
  from chat_messages cm
  left join chat_rooms cr on cr.id = cm.room_id
  left join sites s on s.id = cr.site_id
  where cm.attachments::text like '%chat_request%'
  order by cm.created_at desc
  limit 5
`);
console.log("\nmessage room context:");
for (const row of r4.rows) console.log(" -", row.message_id, "room:", row.room_id, "kind:", row.kind, "site:", row.site_code, "name:", row.room_name);

const r5 = await c.query(`
  select count(*) from chat_room_members
  where room_id = (select room_id from chat_messages where attachments::text like '%chat_request%' order by created_at desc limit 1)
`);
console.log("\nmembers count of that room:", r5.rows[0].count);

await c.end();
