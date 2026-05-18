// Karim 18/05 : simule fetchApplications avec le supabase JS client pour voir
// combien de rows reviennent reellement (vs les 1829 attendus en base).
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

const { data, error } = await supabase
  .from("applications")
  .select(`id, created_at, candidate:candidates(applied_at, full_name)`)
  .order("applied_at", { ascending: false, foreignTable: "candidates" })
  .range(0, 4999);

if (error) {
  console.error("error:", error);
  process.exit(1);
}
console.log("Total rows retournes :", data?.length);
console.log("\n5 premieres :");
for (const r of (data ?? []).slice(0, 5)) {
  console.log(`  ${r.candidate?.applied_at ?? "?"} | ${r.candidate?.full_name ?? "?"}`);
}
console.log("\n5 dernieres :");
for (const r of (data ?? []).slice(-5)) {
  console.log(`  ${r.candidate?.applied_at ?? "?"} | ${r.candidate?.full_name ?? "?"}`);
}
