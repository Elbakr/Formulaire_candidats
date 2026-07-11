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

export type AnthropicVisionArgs = {
  model: string;
  system: string;
  user: string;
  images: Array<{
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    base64: string;
  }>;
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

/**
 * Variante vision de callAnthropic.
 * Construit un message user multi-part : blocs image base64 en premier,
 * puis bloc texte. Réutilise le calcul tokens/cost existant.
 * N'altère pas callAnthropic.
 */
export async function callAnthropicVision(args: AnthropicVisionArgs): Promise<AnthropicCallResult> {
  const c = getClient();

  // Blocs image en premier, texte à la fin (recommandé Anthropic pour vision)
  const userContent: Anthropic.MessageParam["content"] = [
    ...args.images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      }),
    ),
    { type: "text", text: args.user },
  ];

  const resp = await c.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 1500,
    system: [
      {
        type: "text",
        text: args.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const raw_text = resp.content
    .map((block) => (block.type === "text" ? block.text : ""))
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

  return { output, raw_text, tokens_in, tokens_out, cost_usd, model: args.model };
}

export type AnthropicPdfArgs = {
  model: string;
  system: string;
  user: string;
  /** PDF en base64 (sans préfixe data:). */
  pdfBase64: string;
  expectsJson?: boolean;
  maxTokens?: number;
};

/**
 * Variante DOCUMENT (PDF) de callAnthropic. Claude lit nativement le PDF (bloc
 * `document`) — pas besoin de rasteriser. Sert à extraire les CI stockées en PDF.
 */
export async function callAnthropicPdf(args: AnthropicPdfArgs): Promise<AnthropicCallResult> {
  const c = getClient();
  const userContent = [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: args.pdfBase64 },
    },
    { type: "text", text: args.user },
  ] as unknown as Anthropic.MessageParam["content"];

  const resp = await c.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 1000,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  const raw_text = resp.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  let output: unknown = raw_text;
  if (args.expectsJson) output = parseJsonOrThrow(raw_text);

  const tokens_in =
    (resp.usage?.input_tokens ?? 0) +
    (resp.usage?.cache_creation_input_tokens ?? 0) +
    (resp.usage?.cache_read_input_tokens ?? 0);
  const tokens_out = resp.usage?.output_tokens ?? 0;
  const cost_usd = computeCostUsd(args.model, tokens_in, tokens_out);

  return { output, raw_text, tokens_in, tokens_out, cost_usd, model: args.model };
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
