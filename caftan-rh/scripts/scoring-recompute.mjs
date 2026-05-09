#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local") });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query("select recompute_all_employee_metrics() as n");
console.log("Recomputed metrics for", r.rows[0].n, "employees");
await c.end();
