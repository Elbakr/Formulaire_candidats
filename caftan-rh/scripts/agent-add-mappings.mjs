// Agent autonome 2026-05-24 : ajoute les mappings heuristiques pour combler
// les slots manquants sur Pointage A et E.
//
// Strategie : mappings haute-confiance seulement. Karim valide ensuite.
//
// Pointage A :
//   - slot 86 (4-day morning IN, 2026-05-18-21) -> Doha IN
//   - slot 12 (3-day evening OUT) -> Doha OUT
//
// Les autres alpha-only sur A restent sans slot (mapping manuel attendu).
// Pointage E : pas de mapping auto (donnees insuffisantes).
//
// Note : si une row alpha-only existe deja pour l employe en direction='in',
// on UPDATE pour ajouter le slot. Sinon UPSERT (device, employee, direction).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const DEVICE_A = "bfb90ad2054971aefatjkh";
const DOHA_ID = "a52ca977-3aa5-4779-a4a4-d2ce6e85b07c";

// Verifie l'ID Doha
const idCheck = await c.query(`select id, full_name from employees where full_name = 'Rekimi Doha' limit 1`);
const dohaId = idCheck.rows[0]?.id;
if (!dohaId) {
  console.error("Doha not found");
  process.exit(1);
}
console.log("Doha id:", dohaId);

// 1) Update IN row alpha=4zeydy (Doha) avec slot=86
const u1 = await c.query(
  `update tuya_user_mapping
      set tuya_user_id = $1    where tuya_device_id = $2
      and employee_id = $3
      and direction = 'in'
      and tuya_user_id is null
    returning id, tuya_user_id_alpha`,
  ["86", DEVICE_A, dohaId],
);
console.log("Updated IN mapping:", u1.rowCount, "rows", u1.rows);

// 2) Insert OUT mapping pour Doha avec slot=12
// On verifie qu'il n'existe pas deja une OUT row sur ce device+employee
const existOut = await c.query(
  `select id, tuya_user_id from tuya_user_mapping where tuya_device_id=$1 and employee_id=$2 and direction='out'`,
  [DEVICE_A, dohaId],
);
if (existOut.rows.length > 0) {
  console.log("OUT row already exists:", existOut.rows);
  // Update if needed
  if (existOut.rows[0].tuya_user_id !== "12") {
    await c.query(
      `update tuya_user_mapping set tuya_user_id = $1, updated_at = now() where id = $2`,
      ["12", existOut.rows[0].id],
    );
    console.log("Updated existing OUT row to slot 12");
  }
} else {
  const i1 = await c.query(
    `insert into tuya_user_mapping (tuya_device_id, tuya_user_id, employee_id, direction, tuya_name, is_active)
     values ($1, $2, $3, 'out', $4, true)
     returning id`,
    [DEVICE_A, "12", dohaId, "Rekimi Doha OUT"],
  );
  console.log("Inserted OUT mapping for Doha:", i1.rows);
}

// 3) Verifie
const verif = await c.query(
  `select tuya_user_id, tuya_user_id_alpha, direction, is_active from tuya_user_mapping
   where tuya_device_id = $1 and employee_id = $2 order by direction`,
  [DEVICE_A, dohaId],
);
console.log("\nDoha mappings on Pointage A:");
for (const r of verif.rows) {
  console.log(`  slot=${r.tuya_user_id ?? "?"} alpha=${r.tuya_user_id_alpha ?? "-"} ${r.direction} active=${r.is_active}`);
}

await c.end();
