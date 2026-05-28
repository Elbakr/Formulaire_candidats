// Karim 2026-05-24 : test final avant d envoyer le mail "pret a tester".
// Verifie : (1) mappings cross-terminaux, (2) presents actuels, (3) calcul
// par employee pour la vue Mois.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// 1. Mappings par employee (multi-terminaux)
console.log("=== 1) Mappings par employee (consolidation multi-terminaux) ===");
const { rows: m } = await c.query(`
  select e.full_name, count(distinct m.tuya_device_id) as nb_devices,
         count(case when m.tuya_user_id is not null then 1 end) as with_slot,
         count(case when m.tuya_user_id is null then 1 end) as alpha_only
  from employees e
  join tuya_user_mapping m on m.employee_id = e.id and m.is_active
  where e.status = 'active'
  group by e.id, e.full_name
  order by e.full_name
`);
for (const r of m) {
  console.log(`  ${r.full_name.padEnd(28)} | ${r.nb_devices} terminal(s) | slots mappes: ${r.with_slot} | alpha-only: ${r.alpha_only}`);
}

// 2. Presents en ce moment (devrait etre 0)
console.log("\n=== 2) Presents actuellement (clock_currently_in) ===");
const { rows: present } = await c.query(`
  select e.full_name, ci.clock_in_at, ci.site_code
  from clock_currently_in ci
  left join employees e on e.id = ci.employee_id
`);
if (present.length === 0) {
  console.log("  Aucun present (auto-OUT a tout ferme). OK.");
} else {
  for (const r of present) {
    const h = Math.round((Date.now() - new Date(r.clock_in_at).getTime()) / 3600_000);
    console.log(`  ${r.full_name} | IN ${r.clock_in_at.toISOString().slice(0,16)} (${h}h) | site=${r.site_code}`);
  }
}

// 3. Heures travaillees par employe (mai entier)
console.log("\n=== 3) Heures travaillees par employee (mai 1-24) ===");
const { rows: hrs } = await c.query(`
  with paired as (
    select
      e.id as emp_id,
      e.full_name,
      ce.id as in_id,
      ce.occurred_at as in_at,
      (
        select ce2.occurred_at
        from clock_entries ce2
        where ce2.employee_id = ce.employee_id
          and ce2.kind = 'out'
          and ce2.occurred_at > ce.occurred_at
          and ce2.occurred_at < ce.occurred_at + interval '20 hours'
        order by ce2.occurred_at asc
        limit 1
      ) as out_at
    from clock_entries ce
    join employees e on e.id = ce.employee_id
    where ce.kind = 'in'
      and ce.occurred_at >= '2026-05-01'
      and ce.occurred_at < '2026-05-25'
      and e.status = 'active'
  )
  select full_name,
    count(*) as days,
    count(out_at) as days_complets,
    coalesce(sum(extract(epoch from (out_at - in_at)) / 3600), 0)::numeric(6,2) as total_h
  from paired
  group by emp_id, full_name
  order by total_h desc
`);
for (const r of hrs) {
  console.log(`  ${r.full_name.padEnd(28)} | ${r.days} jours pointes | ${r.days_complets} complets (IN+OUT) | ${r.total_h}h total`);
}

await c.end();
