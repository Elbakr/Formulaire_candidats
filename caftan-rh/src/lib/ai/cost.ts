// Anthropic pricing (USD per million tokens). Approximate — adjust if pricing changes.
//
// Prices are per the Anthropic public pricing for Claude Sonnet 4.x and Haiku 4.x families.
// Cache reads cost ~10% of normal input tokens. Cache writes cost ~125% of normal input tokens.
// We currently bill the full input tokens conservatively — Anthropic returns cache hits/misses
// per response so we could refine later.

type Pricing = {
  input_per_million: number;
  output_per_million: number;
};

const PRICING: Record<string, Pricing> = {
  // Claude Sonnet 4.6 — strong tier
  "claude-sonnet-4-6": { input_per_million: 3, output_per_million: 15 },
  "claude-sonnet-4-5": { input_per_million: 3, output_per_million: 15 },
  // Claude Haiku 4.5 — fast tier
  "claude-haiku-4-5-20251001": { input_per_million: 1, output_per_million: 5 },
  "claude-haiku-4-5": { input_per_million: 1, output_per_million: 5 },
};

const FALLBACK: Pricing = { input_per_million: 3, output_per_million: 15 };

export function computeCostUsd(model: string | null | undefined, tokens_in: number, tokens_out: number): number {
  if (!model) return 0;
  const p = PRICING[model] ?? FALLBACK;
  const cost = (tokens_in / 1_000_000) * p.input_per_million + (tokens_out / 1_000_000) * p.output_per_million;
  // Round to 6 decimals for storage in numeric(10,6)
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function pricingFor(model: string | null | undefined): Pricing {
  if (!model) return FALLBACK;
  return PRICING[model] ?? FALLBACK;
}
