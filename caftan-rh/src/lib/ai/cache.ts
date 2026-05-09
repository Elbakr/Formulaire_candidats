// Cache layer for AI outputs.
//
// Key = (task, input_hash) where input_hash = SHA-256 of the deterministic JSON
// stringification of the input. Stored in `ai_outputs`. Hits return the cached
// output directly. TTL is enforced by readers (30 days default) but rows stay
// in DB so we can audit + replay if needed.

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgentTask } from "./agent";

const DEFAULT_TTL_DAYS = 30;

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashInput(input: unknown): string {
  const json = stableStringify(input);
  return createHash("sha256").update(json).digest("hex");
}

export async function lookupCache<O>(
  task: AgentTask,
  input_hash: string,
  ttl_days: number = DEFAULT_TTL_DAYS,
): Promise<{ output: O; model: string | null; tokens_in: number | null; tokens_out: number | null; cost_usd: number } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_outputs")
      .select("output, model, tokens_in, tokens_out, cost_usd, created_at")
      .eq("task", task)
      .eq("input_hash", input_hash)
      .maybeSingle();
    if (error || !data) return null;
    // TTL enforcement on read
    const created = new Date(data.created_at as string);
    const ageMs = Date.now() - created.getTime();
    if (ageMs > ttl_days * 24 * 3600 * 1000) return null;
    return {
      output: data.output as O,
      model: (data.model as string) ?? null,
      tokens_in: (data.tokens_in as number) ?? null,
      tokens_out: (data.tokens_out as number) ?? null,
      cost_usd: Number(data.cost_usd ?? 0),
    };
  } catch (e) {
    console.warn("[ai_cache] lookup failed:", (e as Error).message);
    return null;
  }
}

export async function saveCache(args: {
  task: AgentTask;
  input_hash: string;
  output: unknown;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    // Upsert on (task, input_hash) — uniq index allows retrying / refreshing.
    const { error } = await admin
      .from("ai_outputs")
      .upsert(
        {
          task: args.task,
          input_hash: args.input_hash,
          output: args.output,
          model: args.model,
          tokens_in: args.tokens_in,
          tokens_out: args.tokens_out,
          cost_usd: args.cost_usd,
          cached: false,
        },
        { onConflict: "task,input_hash" },
      );
    if (error) console.warn("[ai_cache] save failed:", error.message);
  } catch (e) {
    console.warn("[ai_cache] save unexpected error:", (e as Error).message);
  }
}
