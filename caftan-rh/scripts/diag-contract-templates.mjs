import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const code = process.argv[2] ?? "employee_pt";
const { data } = await sb.from("contract_templates").select("body_markdown").eq("code", code).maybeSingle();
const body = data?.body_markdown ?? "";
// Show lines with ☒ or ☐
const lines = body.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("☒") || lines[i].includes("☐")) {
    if (lines[i].toLowerCase().includes("horaire") || lines[i].includes("heures") || lines[i].includes("semaine") || lines[i].includes("cycle") || lines[i].includes("variable") || lines[i].includes("flottant")) {
      console.log(`${i+1}: ${lines[i]}`);
    }
  }
}
