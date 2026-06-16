#!/usr/bin/env node
// Karim 2026-06-16 : tamponne public/sw.js avec le SHA du commit au build Vercel,
// pour que le Service Worker change de CACHE_VERSION à CHAQUE déploiement
// (invalidation auto du cache -> fini l'oubli de bump manuel = cache stale).
//
// En local (pas de VERCEL_GIT_COMMIT_SHA) : ne touche à rien (on garde la version
// manuelle du fichier versionné). BEST-EFFORT : ne fait JAMAIS échouer le build.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) {
    console.log("[stamp-sw] pas de VERCEL_GIT_COMMIT_SHA — sw.js inchangé (dev local).");
  } else {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const swPath = resolve(__dirname, "../public/sw.js");
    let content = readFileSync(swPath, "utf8");
    const newVersion = `caftanrh-${sha.slice(0, 8)}`;
    const before = content;
    content = content.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${newVersion}";`);
    if (content !== before) {
      writeFileSync(swPath, content);
      console.log(`[stamp-sw] CACHE_VERSION -> ${newVersion}`);
    } else {
      console.warn("[stamp-sw] motif CACHE_VERSION introuvable — sw.js inchangé.");
    }
  }
} catch (e) {
  console.warn("[stamp-sw] non bloquant:", e?.message);
}
process.exit(0);
