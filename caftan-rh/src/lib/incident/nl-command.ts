// Karim 2026-06-14 : barre de commande LANGAGE NATUREL (incrément 2b).
//
// L'admin écrit une instruction en clair ; Claude la traduit en UNE action d'un
// CATALOGUE FERMÉ (jamais d'action hors liste, jamais de terminal). Le serveur
// exécute les actions « safe » directement et renvoie les « sensitive » en
// proposition à confirmer. Tout reste dans l'app, explicable et traçable.

import { callAnthropic, isAnthropicConfigured } from "@/lib/ai/providers/anthropic";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { recordLearning, setAutoPaused } from "./learnings";

export type CommandAction =
  | "retrigger_tuya_poll"
  | "force_close_orphans"
  | "silence_signature"
  | "resolve_incident"
  | "delete_test_mails"
  | "pause_auto"
  | "resume_auto"
  | "resend_mail"
  | "none";

type CatalogEntry = {
  action: CommandAction;
  sensitivity: "safe" | "sensitive";
  desc: string;
  params?: string;
};

// Catalogue FERMÉ : l'IA ne peut choisir QUE parmi ces actions.
const CATALOG: CatalogEntry[] = [
  { action: "retrigger_tuya_poll", sensitivity: "safe", desc: "Relancer l'import des badges Tuya (rattrape les passages manqués)." },
  { action: "force_close_orphans", sensitivity: "safe", desc: "Fermer les pointages restés ouverts >24h (heure estimée)." },
  { action: "silence_signature", sensitivity: "safe", desc: "Mettre un type d'alerte en sourdine (ne plus notifier).", params: "signature (ex: failed_mails). Par défaut: l'incident courant." },
  { action: "resolve_incident", sensitivity: "safe", desc: "Clore l'incident courant." },
  { action: "delete_test_mails", sensitivity: "safe", desc: "Supprimer les lignes de mails de test (simulated for test)." },
  { action: "pause_auto", sensitivity: "safe", desc: "Activer la Pause auto (l'agent n'agit plus seul)." },
  { action: "resume_auto", sensitivity: "safe", desc: "Désactiver la Pause auto." },
  { action: "resend_mail", sensitivity: "sensitive", desc: "Renvoyer un e-mail passé. ATTENTION : règle permanente = ne PAS renvoyer les mails passés cassés.", params: "mail_id" },
];

export type Interpretation = {
  ok: boolean;
  action: CommandAction;
  params: Record<string, unknown>;
  sensitivity: "safe" | "sensitive";
  reason: string;
  confidence: number;
  error?: string;
};

/** Traduit une instruction en langage naturel en une action du catalogue. */
export async function interpretCommand(
  text: string,
  ctx: { incidentId?: string; signature?: string },
): Promise<Interpretation> {
  if (!isAnthropicConfigured()) {
    return { ok: false, action: "none", params: {}, sensitivity: "safe", reason: "IA non configurée (ANTHROPIC_API_KEY manquante).", confidence: 0, error: "ai_unconfigured" };
  }
  const system =
    "Tu es l'agent d'astreinte RH de Caftan Factory. Tu traduis l'instruction d'un admin en UNE action d'un catalogue FERMÉ. " +
    "Tu ne proposes JAMAIS d'action hors catalogue et tu n'exécutes jamais de commande système/terminal. " +
    'Réponds en JSON STRICT : {"action": <clé du catalogue ou "none">, "params": {..}, "confidence": 0..1, "reason": "<courte explication en français>"}. ' +
    'Si l\'instruction est ambiguë ou ne correspond à aucune action, mets action="none" et explique dans reason.\n\nCATALOGUE:\n' +
    CATALOG.map((c) => `- ${c.action} (${c.sensitivity}) : ${c.desc}${c.params ? ` [params: ${c.params}]` : ""}`).join("\n");
  const user = `Contexte: incident_id=${ctx.incidentId ?? "—"}, signature_panne=${ctx.signature ?? "—"}.\nInstruction de l'admin:\n"""${text}"""`;

  try {
    const res = await callAnthropic({ model: "claude-sonnet-4-6", system, user, expectsJson: true, maxTokens: 400 });
    const o = (res.output ?? {}) as { action?: string; params?: Record<string, unknown>; confidence?: number; reason?: string };
    const entry = CATALOG.find((c) => c.action === o.action);
    const action = (entry?.action ?? "none") as CommandAction;
    return {
      ok: true,
      action,
      params: o.params ?? {},
      sensitivity: entry?.sensitivity ?? "safe",
      reason: o.reason ?? "",
      confidence: typeof o.confidence === "number" ? o.confidence : 0.5,
    };
  } catch (e) {
    return { ok: false, action: "none", params: {}, sensitivity: "safe", reason: `Erreur IA : ${(e as Error).message}`, confidence: 0, error: "ai_error" };
  }
}

async function internalCron(path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const secret = process.env.CRON_SECRET ?? "";
  try {
    const res = await fetch(`${getPublicBaseUrl()}/api/cron/${path}`, {
      headers: { Authorization: `Bearer ${secret}`, "User-Agent": "nl-command" },
      cache: "no-store",
    });
    let body: Record<string, unknown> | null = null;
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } };
  }
}

/** Exécute une action validée. */
export async function executeAction(
  action: CommandAction,
  params: Record<string, unknown>,
  ctx: { incidentId?: string; signature?: string },
): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  switch (action) {
    case "retrigger_tuya_poll": {
      const r = await internalCron("tuya-poll");
      const ins = (r.body?.entries_inserted as number | undefined);
      return { ok: r.ok, message: `Poll Tuya relancé (HTTP ${r.status}${ins != null ? `, ${ins} passage(s) rattrapé(s)` : ""}).` };
    }
    case "force_close_orphans": {
      const r = await internalCron("force-close-orphans");
      return { ok: r.ok, message: `Fermeture des orphelins lancée (HTTP ${r.status}, ${(r.body?.force_closed as number | undefined) ?? 0} fermé(s)).` };
    }
    case "silence_signature": {
      const sig = String(params.signature ?? ctx.signature ?? "").trim();
      if (!sig) return { ok: false, message: "Quel type de panne mettre en sourdine ? (signature manquante)" };
      await recordLearning({ signature: sig, option: "ignore_auto", mode: "auto" });
      return { ok: true, message: `« ${sig} » mis en sourdine — révocable depuis l'écran incident.` };
    }
    case "resolve_incident": {
      if (!ctx.incidentId) return { ok: false, message: "Aucun incident courant à clore." };
      await admin.from("incidents").update({ status: "resolved", resolved_at: nowIso, repair_model: "nl:resolve" }).eq("id", ctx.incidentId);
      return { ok: true, message: "Incident clôturé." };
    }
    case "delete_test_mails": {
      const { data } = await admin.from("outbound_mails").delete().eq("status", "failed").eq("error_message", "simulated for test").select("id");
      return { ok: true, message: `${(data ?? []).length} ligne(s) de mail de test supprimée(s).` };
    }
    case "pause_auto":
      await setAutoPaused(true);
      return { ok: true, message: "Pause auto ACTIVÉE — l'agent n'agit plus seul." };
    case "resume_auto":
      await setAutoPaused(false);
      return { ok: true, message: "Pause auto désactivée — règles auto réactivées." };
    case "resend_mail":
      // Règle permanente de Karim : on ne renvoie PAS les mails passés cassés.
      return { ok: false, message: "Renvoi refusé : ta règle permanente interdit de renvoyer les mails passés cassés. Lève-la explicitement si tu veux changer ce comportement." };
    default:
      return { ok: false, message: "Action non reconnue." };
  }
}

export function sensitivityOf(action: CommandAction): "safe" | "sensitive" {
  return CATALOG.find((c) => c.action === action)?.sensitivity ?? "safe";
}
