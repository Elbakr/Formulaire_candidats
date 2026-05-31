#!/usr/bin/env node
// Karim 2026-05-30 : nettoyage residu separateur table dans employee_pt

import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query("select body_markdown from contract_templates where code = 'employee_pt'");
let md = rows[0].body_markdown;
const before = md.length;

// Lignes qui contiennent UNIQUEMENT pipes, dashes, espaces -> separator table orpheline
const cleanLines = md.split("\n").filter((l) => {
  const t = l.trim();
  if (t === "") return true;
  // Si la ligne contient uniquement |, -, et espaces, c est un separator
  return !/^[\|\-\s]+$/.test(t);
});

md = cleanLines.join("\n").replace(/\n{3,}/g, "\n\n");

await c.query("update contract_templates set body_markdown = $1, updated_at = now() where code = 'employee_pt'", [md]);
const after = md.length;
console.log(`employee_pt : ${before} -> ${after} chars (delta ${after - before})`);
console.log(`Residu '|---|' ? : ${/\|---\|---\|/.test(md)}`);
console.log(`Lignes : ${md.split("\n").length}`);

await c.end();
