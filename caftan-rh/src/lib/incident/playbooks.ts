// Karim 2026-06-14 : playbooks de réparation de l'agent d'astreinte (incrément 1).
//
// Hybride : ici les playbooks DÉTERMINISTES pour les pannes connues (sûres et
// réversibles). Une signature sans playbook renvoie `null` -> l'incident-manager
// escalade (avec la solution explicable déjà portée par l'issue, et — incrément 2
// — un diagnostic IA pour les signatures réellement inconnues type échec de cron).
//
// Règle de sûreté : un playbook ne fait que des actions RÉVERSIBLES / idempotentes
// (relancer un cron de rattrapage, fermer des sessions orphelines déjà en retard).
// Aucune modification de code ni d'infra ici.

import { getPublicBaseUrl } from "@/lib/public-base-url";
import { runHealthChecks, type Issue } from "@/lib/system/health-checks";

export type PlaybookOutcome = {
  fixed: boolean;
  /** Identité du « modèle de réparation » utilisé (pour la notif finale). */
  model: string;
  /** Cause racine, expliquée. */
  cause: string;
  /** Solution réellement appliquée. */
  solution: string;
  /** Mécanisme de prévention anti-récidive mis en place. */
  prevention: string;
  /** Trace technique courte (réponse du endpoint relancé). */
  detail?: string;
};

/** Self-call authentifié vers un endpoint cron interne (Bearer CRON_SECRET). */
async function callInternalCron(
  path: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const secret = process.env.CRON_SECRET ?? "";
  const base = getPublicBaseUrl();
  try {
    const res = await fetch(`${base}/api/cron/${path}`, {
      headers: { Authorization: `Bearer ${secret}`, "User-Agent": "incident-manager" },
      cache: "no-store",
    });
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* corps non-JSON */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } };
  }
}

/**
 * Tente la réparation déterministe d'une issue. Renvoie l'issue d'un playbook,
 * ou `null` si aucun playbook sûr n'existe pour cette signature (-> escalade).
 */
export async function runPlaybook(issue: Issue): Promise<PlaybookOutcome | null> {
  switch (issue.key) {
    // Ingestion Tuya à l'arrêt / personne présent en journée : relance le poll
    // (rattrape les passages manqués), puis re-vérifie.
    case "tuya_ingestion_stalled":
    case "no_presence_daytime": {
      const r = await callInternalCron("tuya-poll");
      const after = await runHealthChecks();
      const stillBroken = after.some(
        (i) => i.key === "tuya_ingestion_stalled" || i.key === "no_presence_daytime",
      );
      const inserted = (r.body?.entries_inserted as number | undefined) ?? null;
      return {
        fixed: r.ok && !stillBroken,
        model: "playbook:retrigger_tuya_poll",
        cause:
          "Le poll Tuya (import des badges) n'avait pas tourné récemment : passages non importés, présence faussée / vide.",
        solution:
          `Relance de /api/cron/tuya-poll (HTTP ${r.status}` +
          (inserted != null ? `, ${inserted} passage(s) rattrapé(s)` : "") +
          ").",
        prevention:
          "Surveillance continue du poll Tuya par l'agent d'astreinte : toute stagnation >12h relance automatiquement le poll avant toute alerte humaine.",
        detail: r.body ? JSON.stringify(r.body).slice(0, 300) : undefined,
      };
    }

    // Pointages ouverts >24h : ferme les sessions orphelines (heure estimée).
    case "open_clocks_24h": {
      const r = await callInternalCron("force-close-orphans");
      const after = await runHealthChecks();
      const stillOpen = after.some((i) => i.key === "open_clocks_24h");
      const closed = (r.body?.force_closed as number | undefined) ?? 0;
      return {
        fixed: r.ok && !stillOpen,
        model: "playbook:force_close_orphans",
        cause:
          "Des pointages IN sans OUT depuis >24h (badge de sortie oublié) laissaient des employés « présents » indéfiniment.",
        solution:
          `Fermeture statistique via /api/cron/force-close-orphans (${closed} session(s) close(s), ` +
          "heure de sortie estimée, corrigeable par la RH).",
        prevention:
          "L'agent ferme désormais automatiquement les sessions orphelines >24h dès détection.",
        detail: r.body ? JSON.stringify(r.body).slice(0, 300) : undefined,
      };
    }

    // crons_frozen / failed_mails / anomalous_clocks : pas de réparation
    // automatique SÛRE -> escalade (incrément 2 : diagnostic IA + remédiation infra).
    default:
      return null;
  }
}
