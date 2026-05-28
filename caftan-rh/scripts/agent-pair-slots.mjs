// Agent autonome : pair les events par jour pour identifier paires IN/OUT
// d un meme employe sur Pointage A.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const events = JSON.parse(fs.readFileSync(resolve(__dirname, "../tmp-bfb90ad2054971aefatjkh-events.json"), "utf8"));
events.sort((a, b) => a.ts - b.ts);

// Group by day, then list slot+hour
const byDay = new Map();
for (const e of events) {
  const day = e.iso.slice(0, 10);
  const arr = byDay.get(day) ?? [];
  arr.push(e);
  byDay.set(day, arr);
}

const days = [...byDay.keys()].sort();
console.log("=== Pointage A : timeline par jour ===");
for (const day of days) {
  console.log(`\n${day}:`);
  for (const e of byDay.get(day)) {
    const hh = new Date(e.ts).toISOString().slice(11, 16);
    console.log(`  ${hh}  slot=${String(e.uid).padStart(4)}`);
  }
}

console.log("\n=== Pointage E ===");
const eventsE = JSON.parse(fs.readFileSync(resolve(__dirname, "../tmp-bfd90b87c696ead286zzxm-events.json"), "utf8"));
eventsE.sort((a, b) => a.ts - b.ts);
const byDayE = new Map();
for (const e of eventsE) {
  const day = e.iso.slice(0, 10);
  const arr = byDayE.get(day) ?? [];
  arr.push(e);
  byDayE.set(day, arr);
}
const daysE = [...byDayE.keys()].sort();
for (const day of daysE) {
  console.log(`\n${day}:`);
  for (const e of byDayE.get(day)) {
    const hh = new Date(e.ts).toISOString().slice(11, 16);
    console.log(`  ${hh}  slot=${String(e.uid).padStart(4)}`);
  }
}
