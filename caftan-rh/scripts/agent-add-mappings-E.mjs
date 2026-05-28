// Agent : ajoute des mappings alpha-only sur Pointage E pour les employes
// CaftanRH dont le nom matche un user enrole sur le device, mais sans connaitre
// encore le slot. Ces mappings vont permettre a Karim de simplement mapper
// le slot ensuite via /admin/tuya/logs (quick enroll).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const DEVICE_E = "bfd90b87c696ead286zzxm";

// Mapping name (Tuya nick) -> employee full_name
const matches = [
  { alpha: "4y08m6", nick: "lina2", emp: "El Bertitan Lina" },
  { alpha: "4tfqgy", nick: "Ilham", emp: "Ilham Serghini" },
  { alpha: "4vu1ki", nick: "assya", emp: "Assya" },
  { alpha: "3a0u6u", nick: "Omaima", emp: "Omaima Ouahi" },
  { alpha: "3t0vkq", nick: "doha", emp: "Rekimi Doha" },
  { alpha: "4hfs5u", nick: "hajar elkandoussi", emp: "Hajar" },
  { alpha: "3wgwme", nick: "salman", emp: "Salmane Elbazi" },
  { alpha: "3auvle", nick: "Chaymae Ch", emp: "Chaymae" },
  { alpha: "4utewa", nick: "Lina", emp: "El Bertitan Lina" }, // dup possible
];

let added = 0;
let skipped = 0;

for (const m of matches) {
  // Get employee_id
  const e = await c.query(`select id from employees where full_name = $1 limit 1`, [m.emp]);
  if (e.rows.length === 0) {
    console.log(`SKIP ${m.alpha} (${m.nick}) -> ${m.emp} : employee not found`);
    skipped++;
    continue;
  }
  const empId = e.rows[0].id;

  // Check if mapping already exists
  const existing = await c.query(
    `select id, tuya_user_id_alpha from tuya_user_mapping where tuya_device_id=$1 and employee_id=$2 and direction='in'`,
    [DEVICE_E, empId],
  );
  if (existing.rows.length > 0) {
    console.log(`SKIP ${m.alpha} (${m.nick}) -> ${m.emp} : mapping IN already exists (alpha=${existing.rows[0].tuya_user_id_alpha})`);
    skipped++;
    continue;
  }

  // Insert alpha-only mapping (slot = null, to be filled later)
  try {
    await c.query(
      `insert into tuya_user_mapping (tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, tuya_name, is_active)
       values ($1, null, $2, $3, 'in', $4, true)`,
      [DEVICE_E, m.alpha, empId, m.nick],
    );
    console.log(`ADD ${m.alpha} (${m.nick}) -> ${m.emp}`);
    added++;
  } catch (e) {
    console.log(`ERR ${m.alpha} (${m.nick}) -> ${m.emp} : ${e.message}`);
  }
}

console.log(`\nTotal: ${added} added, ${skipped} skipped`);

await c.end();
