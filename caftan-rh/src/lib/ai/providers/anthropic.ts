// Anthropic provider — fait l'appel HTTP à Claude.
//
// - Utilise prompt caching (cache_control: { type: 'ephemeral' }) sur le system prompt
//   pour réduire le coût (jusqu'à 90 % de réduction sur tokens d'input répétés).
// - Demande une sortie JSON quand le prompt l'indique : on parse en best-effort.
// - Renvoie tokens / cost / output. Lance si l'API rejette.

import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd } from "../cost";

export type AnthropicCallArgs = {
  model: string;
  system: string;
  user: string;
  expectsJson?: boolean;
  maxTokens?: number;
};

export type AnthropicCallResult = {
  output: unknown;
  raw_text: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }
  client = new Anthropic({ apiKey });
  return client;
}

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function callAnthropic(args: AnthropicCallArgs): Promise<AnthropicCallResult> {
  const c = getClient();
  const resp = await c.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 1500,
    // Prompt caching on the system prompt — major win for stable system prompts repeated across calls.
    system: [
      {
        type: "text",
        text: args.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: args.user,
      },
    ],
  });

  // Concatenate all text blocks
  const raw_text = resp.content
    .map((block) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("\n")
    .trim();

  let output: unknown = raw_text;
  if (args.expectsJson) {
    output = parseJsonOrThrow(raw_text);
  }

  const tokens_in =
    (resp.usage?.input_tokens ?? 0) +
    (resp.usage?.cache_creation_input_tokens ?? 0) +
    (resp.usage?.cache_read_input_tokens ?? 0);
  const tokens_out = resp.usage?.output_tokens ?? 0;
  const cost_usd = computeCostUsd(args.model, tokens_in, tokens_out);

  return {
    output,
    raw_text,
    tokens_in,
    tokens_out,
    cost_usd,
    model: args.model,
  };
}

function parseJsonOrThrow(text: string): unknown {
  // Strip markdown fences if any
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  // Best-effort find first balanced JSON object/array
  const firstBrace = Math.min(
    ...[t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0).concat([Number.POSITIVE_INFINITY]),
  );
  if (firstBrace !== Number.POSITIVE_INFINITY) {
    t = t.slice(firstBrace);
  }
  // Find last matching brace
  const lastClose = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastClose >= 0) t = t.slice(0, lastClose + 1);

  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(`Failed to parse JSON output: ${(e as Error).message}. Raw: ${text.slice(0, 200)}`);
  }
}
