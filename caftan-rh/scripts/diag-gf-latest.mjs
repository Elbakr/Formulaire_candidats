// Karim 17/05 : verifier les derniers candidats RÉCUPÉRÉS depuis l API GF
// (et non ceux deja en base). Permet de voir si l API renvoie des entries
// recentes que la base n a pas.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: s } = await supabase.from("gf_settings").select("*").eq("id", 1).single();
const auth = "Basic " + Buffer.from(`${s.ck}:${s.cs}`).toString("base64");

// Fetch les 10 dernieres entries depuis l API GF (tri par date_created DESC)
const url = `${s.wp_url}/wp-json/gf/v2/forms/${s.form_id}/entries?paging[page_size]=10&sorting[key]=date_created&sorting[direction]=DESC`;
const res = await fetch(url, { headers: { Authorization: auth } });
const json = await res.json();
const entries = json?.entries ?? [];

console.log(`\n10 dernieres entries cote API GF :\n`);
for (const e of entries.slice(0, 10)) {
  console.log(`  ${e.date_created ?? "?"} | id=${e.id} | ${(e["1"] ?? e["3"] ?? e.first_name ?? "?")} ${(e["2"] ?? e["4"] ?? e.last_name ?? "")} | ${e["5"] ?? e.email ?? "?"}`);
}

// Compare avec la base
const apiIds = entries.map((e) => String(e.id));
const { data: dbRows } = await supabase
  .from("candidates")
  .select("gf_entry_id, created_at, full_name")
  .in("gf_entry_id", apiIds);
const dbSet = new Set((dbRows ?? []).map((r) => String(r.gf_entry_id)));

console.log(`\nManquants en base (parmi les 10 dernieres API) :`);
const missing = entries.filter((e) => !dbSet.has(String(e.id)));
if (missing.length === 0) {
  console.log("  Aucun -> toutes les 10 dernieres sont deja en base.");
} else {
  for (const e of missing) {
    console.log(`  ⚠ id=${e.id} | ${e.date_created} | ${e["1"] ?? ""} ${e["2"] ?? ""}`);
  }
}
