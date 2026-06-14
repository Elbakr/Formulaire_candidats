#!/usr/bin/env node
// Karim 2026-06-14 : repare les "IN fantomes" causes par un badge OUT reel
// arrivant APRES un auto-OUT estime (bug Omaima 14/06). Pour chaque cas
// [auto_close OUT a Ta]  ->  [tuya IN a Tb] avec Tb-Ta dans [-0.5h, +3h] :
//   - supprime l'auto-OUT estime
//   - rebascule le tuya IN en OUT (= la vraie sortie)
//
// SÛR : dry-run par defaut (affiche ce qu'il ferait). Ajouter --apply pour
// executer. Optionnel : --days N (defaut 1 = aujourd'hui en heure belge).
//
// Usage : node scripts/fix-phantom-out.mjs            (dry-run)
//         node scripts/fix-phantom-out.mjs --apply
//         node scripts/fix-phantom-out.mjs --apply --days 2

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8").replace(/\r/g, "");
const g = (k) => { for (const l of env.split("\n")) { const i = l.indexOf("="); if (i > 0 && l.slice(0, i).trim() === k) return l.slice(i + 1).trim(); } return null; };
const BASE = g("NEXT_PUBLIC_SUPABASE_URL"), KEY = g("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !KEY) { console.error("env Supabase manquant"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > -1 ? Math.max(1, Number(process.argv[daysArg + 1] || 1)) : 1;

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const get = (p) => fetch(BASE + "/rest/v1/" + p, { headers: H }).then((r) => r.json());

const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

async function main() {
  // 1) Tous les auto-OUT estimes sur la fenetre
  const autos = await get(`clock_entries?source=eq.auto_close&kind=eq.out&occurred_at=gte.${encodeURIComponent(since)}&select=id,employee_id,occurred_at&order=occurred_at.asc`);
  if (!Array.isArray(autos)) { console.error("Erreur lecture:", JSON.stringify(autos).slice(0, 200)); process.exit(1); }
  console.log(`${autos.length} auto-OUT estime(s) sur ${DAYS}j. Recherche d'IN fantomes...`);

  let fixed = 0;
  for (const ao of autos) {
    const ta = new Date(ao.occurred_at).getTime();
    // le prochain event de l'employe apres l'auto-OUT
    const next = await get(`clock_entries?employee_id=eq.${ao.employee_id}&occurred_at=gt.${encodeURIComponent(ao.occurred_at)}&select=id,kind,occurred_at,source&order=occurred_at.asc&limit=1`);
    const nx = Array.isArray(next) ? next[0] : null;
    if (!nx) continue;
    const deltaH = (new Date(nx.occurred_at).getTime() - ta) / 3600_000;
    // pattern : IN tuya juste apres l'auto-OUT (la vraie sortie mal classee)
    if (nx.kind === "in" && nx.source === "tuya" && deltaH > -0.5 && deltaH < 3) {
      const empName = await get(`employees?id=eq.${ao.employee_id}&select=full_name`).then((r) => (Array.isArray(r) && r[0] ? r[0].full_name : ao.employee_id));
      console.log(`  ${APPLY ? "[FIX]" : "[DRY]"} ${empName} : auto-OUT ${ao.occurred_at.slice(11, 16)} supprime, IN ${nx.occurred_at.slice(11, 16)} -> OUT reel`);
      if (APPLY) {
        await fetch(`${BASE}/rest/v1/clock_entries?id=eq.${ao.id}`, { method: "DELETE", headers: H });
        await fetch(`${BASE}/rest/v1/clock_entries?id=eq.${nx.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ kind: "out", notes: "OUT reel - corrige (etait IN fantome apres auto-OUT estime)" }) });
      }
      fixed++;
    }
  }
  console.log(`\n${fixed} cas ${APPLY ? "CORRIGE(S)" : "a corriger (dry-run, relance avec --apply)"}.`);
}

main().catch((e) => { console.error("Erreur:", e.message); process.exit(1); });
