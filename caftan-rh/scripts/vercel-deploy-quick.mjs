#!/usr/bin/env node
// Karim 2026-06-05 : re-deploy rapide (skip env vars, deja pousses).
// Usage : cd caftan-rh && node scripts/vercel-deploy-quick.mjs

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("════ Deploy production (env vars deja pousses) ════");
try {
  execSync(`npx --yes vercel@latest --prod --yes`, {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });
  console.log("\n✅ Deploiement termine.");
} catch (e) {
  console.error("Deploy failed:", e.message);
  process.exit(1);
}
