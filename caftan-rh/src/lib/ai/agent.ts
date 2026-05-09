// Main agent orchestrator.
//
// runAgent({ task, input, ... }) :
// - hash input → lookup cache
// - if cache hit : log audit (cached=true), return cached output
// - else : call provider (Anthropic) with prompt for the task
// - persist output in ai_outputs cache, log audit, return output
//
// Graceful degradation : if no API key configured, returns { ok: false, error } without throwing.
// All errors are caught — we never crash the caller.

import { createAdminClient } from "@/lib/supabase/server";
import { hashInput, lookupCache, saveCache } from "./cache";
import { logAudit } from "./audit";
import { callAnthropic, isAnthropicConfigured } from "./providers/anthropic";

export type AgentTask =
  | "triage"
  | "reply_draft"
  | "candidate_scoring"
  | "doc_classify"
  | "scheduling"
  | "digest"
  | "anomaly";

type ModelTier = "fast" | "strong";

const TASK_DEFAULT_TIER: Record<AgentTask, ModelTier> = {
  triage: "fast",
  reply_draft: "strong",
  candidate_scoring: "strong",
  doc_classify: "fast",
  scheduling: "strong",
  digest: "strong",
  anomaly: "strong",
};

export type RunAgentArgs<TInput, _TOutput = unknown> = {
  task: AgentTask;
  input: TInput;
  context?: { applicationId?: string; candidateId?: string; employeeId?: string };
  cache?: boolean;
  model?: ModelTier;
  callerProfileId?: string;
};

export type RunAgentResult<TOutput> = {
  ok: boolean;
  output?: TOutput;
  cached?: boolean;
  error?: string;
  cost_usd?: number;
  audit_id?: string | null;
  model?: string;
};

type LoadedPrompt<TInput> = {
  system: string;
  userBuilder: (i: TInput) => string;
  expectsJson?: boolean;
};

async function loadPrompt<TInput>(task: AgentTask): Promise<LoadedPrompt<TInput>> {
  // Static imports (avoids dynamic import quirks under the Next.js bundler).
  switch (task) {
    case "triage": {
      const m = await import("./prompts/triage.v1");
      return { system: m.system, userBuilder: m.userBuilder as (i: TInput) => string, expectsJson: m.expectsJson };
    }
    case "reply_draft": {
      const m = await import("./prompts/reply-draft.v1");
      return { system: m.system, userBuilder: m.userBuilder as (i: TInput) => string, expectsJson: m.expectsJson };
    }
    case "candidate_scoring": {
      const m = await import("./prompts/candidate-scoring.v1");
      return { system: m.system, userBuilder: m.userBuilder as (i: TInput) => string, expectsJson: m.expectsJson };
    }
    case "doc_classify": {
      const m = await import("./prompts/doc-classify.v1");
      return { system: m.system, userBuilder: m.userBuilder as (i: TInput) => string, expectsJson: m.expectsJson };
    }
    case "digest": {
      const m = await import("./prompts/digest.v1");
      return { system: m.system, userBuilder: m.userBuilder as (i: TInput) => string, expectsJson: m.expectsJson };
    }
    case "scheduling":
    case "anomaly":
      throw new Error(`Prompt for task "${task}" not yet implemented.`);
  }
}

async function getOrgAiSettings(): Promise<{
  provider: string;
  model_strong: string;
  model_fast: string;
}> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("org_settings")
      .select("ai_provider, ai_model_strong, ai_model_fast")
      .eq("id", 1)
      .maybeSingle();
    return {
      provider: (data?.ai_provider as string) ?? "anthropic",
      model_strong: (data?.ai_model_strong as string) ?? "claude-sonnet-4-6",
      model_fast: (data?.ai_model_fast as string) ?? "claude-haiku-4-5-20251001",
    };
  } catch {
    return {
      provider: "anthropic",
      model_strong: "claude-sonnet-4-6",
      model_fast: "claude-haiku-4-5-20251001",
    };
  }
}

export async function runAgent<TInput, TOutput>(
  args: RunAgentArgs<TInput, TOutput>,
): Promise<RunAgentResult<TOutput>> {
  const { task, input, context, cache: useCache = true, callerProfileId } = args;
  const tier: ModelTier = args.model ?? TASK_DEFAULT_TIER[task] ?? "strong";
  const t0 = Date.now();

  // Graceful degradation
  if (!isAnthropicConfigured()) {
    const audit = await logAudit({
      task,
      called_by: callerProfileId ?? null,
      application_id: context?.applicationId ?? null,
      candidate_id: context?.candidateId ?? null,
      employee_id: context?.employeeId ?? null,
      success: false,
      error: "AI provider not configured (ANTHROPIC_API_KEY missing)",
      duration_ms: 0,
      cost_usd: 0,
    });
    return {
      ok: false,
      error: "AI provider not configured",
      audit_id: audit.id,
    };
  }

  const settings = await getOrgAiSettings();
  const model = tier === "strong" ? settings.model_strong : settings.model_fast;
  const input_hash = hashInput({ task, input });

  // Cache lookup
  if (useCache) {
    const hit = await lookupCache<TOutput>(task, input_hash);
    if (hit) {
      const audit = await logAudit({
        task,
        called_by: callerProfileId ?? null,
        application_id: context?.applicationId ?? null,
        candidate_id: context?.candidateId ?? null,
        employee_id: context?.employeeId ?? null,
        model: hit.model,
        duration_ms: Date.now() - t0,
        success: true,
        cost_usd: 0,
        cached: true,
      });
      return {
        ok: true,
        output: hit.output,
        cached: true,
        cost_usd: 0,
        audit_id: audit.id,
        model: hit.model ?? undefined,
      };
    }
  }

  // Provider call
  try {
    const prompt = await loadPrompt<TInput>(task);
    const userMsg = prompt.userBuilder(input);

    if (settings.provider !== "anthropic") {
      throw new Error(`Provider "${settings.provider}" not supported (anthropic only for now).`);
    }

    const result = await callAnthropic({
      model,
      system: prompt.system,
      user: userMsg,
      expectsJson: prompt.expectsJson ?? true,
    });

    if (useCache) {
      await saveCache({
        task,
        input_hash,
        output: result.output as unknown,
        model: result.model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
      });
    }

    const audit = await logAudit({
      task,
      called_by: callerProfileId ?? null,
      application_id: context?.applicationId ?? null,
      candidate_id: context?.candidateId ?? null,
      employee_id: context?.employeeId ?? null,
      model: result.model,
      duration_ms: Date.now() - t0,
      success: true,
      cost_usd: result.cost_usd,
      cached: false,
    });

    return {
      ok: true,
      output: result.output as TOutput,
      cached: false,
      cost_usd: result.cost_usd,
      audit_id: audit.id,
      model: result.model,
    };
  } catch (e) {
    const message = (e as Error).message ?? "AI call failed";
    const audit = await logAudit({
      task,
      called_by: callerProfileId ?? null,
      application_id: context?.applicationId ?? null,
      candidate_id: context?.candidateId ?? null,
      employee_id: context?.employeeId ?? null,
      model,
      duration_ms: Date.now() - t0,
      success: false,
      error: message,
      cost_usd: 0,
    });
    return {
      ok: false,
      error: message,
      audit_id: audit.id,
      model,
    };
  }
}
