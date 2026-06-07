#!/usr/bin/env node
// Karim 2026-06-05 : automatise le 1er deploy Vercel.
// Pre-requis : `vercel login` deja fait (cf instructions Claude).
//
// Etapes :
//   1. `vercel link` (cree ou re-lie le projet)
//   2. Lit .env.local + pousse chaque var vers Vercel (scope=production)
//   3. `vercel --prod` pour le 1er deploy
//   4. Affiche l URL prod finale
//
// Usage : cd caftan-rh && node scripts/vercel-deploy.mjs

import { readFileSync, existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Vars qu on NE pousse PAS sur Vercel (specifiques local)
const SKIP_VARS = new Set([
  "NEXT_PUBLIC_SITE_URL",       // Vercel set ca auto via VERCEL_URL
  "DOTENV_CONFIG_PATH",
]);

function parseEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) {
    console.error("Pas de .env.local trouve");
    process.exit(1);
  }
  const txt = readFileSync(path, "utf8");
  const lines = txt.split(/\r?\n/);
  const vars = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    vars[key] = value;
  }
  return vars;
}

function vercelExec(args, options = {}) {
  return execSync(`npx --yes vercel@latest ${args}`, {
    cwd: ROOT,
    stdio: options.silent ? "pipe" : "inherit",
    encoding: "utf8",
    ...options,
  });
}

async function vercelPipe(args, stdinValue) {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn("npx", ["--yes", "vercel@latest", ...args.split(" ")], {
      cwd: ROOT,
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => stdout += d);
    child.stderr?.on("data", (d) => stderr += d);
    child.on("close", (code) => {
      if (code === 0) resolveFn({ stdout, stderr });
      else rejectFn(new Error(`vercel ${args} exit ${code}: ${stderr}`));
    });
    if (stdinValue !== undefined) {
      child.stdin?.write(stdinValue);
      child.stdin?.end();
    }
  });
}

console.log("════ 1. Verifie auth ════");
try {
  const who = vercelExec("whoami", { silent: true });
  console.log(`  Connecte : ${who.trim()}`);
} catch {
  console.error("  ❌ Pas connecte. Lance d abord : npx --yes vercel@latest login");
  process.exit(1);
}

console.log("\n════ 2. Link projet ════");
try {
  vercelExec("link --yes");
} catch (e) {
  console.error("Link failed:", e.message);
  process.exit(1);
}

console.log("\n════ 3. Pousse env vars vers Vercel (production) ════");
const vars = parseEnvLocal();
const keys = Object.keys(vars).filter((k) => !SKIP_VARS.has(k));
console.log(`  ${keys.length} variables a pousser (${SKIP_VARS.size} skippe)`);

for (const key of keys) {
  process.stdout.write(`  - ${key.padEnd(45)} ... `);
  try {
    try { vercelExec(`env rm ${key} production --yes`, { silent: true }); } catch {/* */}
    await vercelPipe(`env add ${key} production`, vars[key] + "\n");
    console.log("OK");
  } catch (e) {
    console.log(`KO (${e.message.slice(0, 60)})`);
  }
}

console.log("\n════ 4. Deploy production ════");
try {
  vercelExec("--prod --yes");
} catch (e) {
  console.error("Deploy failed:", e.message);
  process.exit(1);
}

console.log("\n✅ Deploiement termine.");
