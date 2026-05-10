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

const r = await c.query(`
  select u.id, u.email, u.created_at, p.role, p.full_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at
`);
console.log("Comptes:");
for (const row of r.rows) {
  console.log(` - ${row.email}  | role=${row.role ?? "—"}  | name=${row.full_name ?? "—"}`);
}

await c.end();
