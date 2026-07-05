// Karim 2026-07-02 : KILL-SWITCH des envois AUTOMATIQUES vers candidats/travailleurs.
//
// Règle métier : le système ne doit plus envoyer d'outreach AUTOMATIQUE (crons,
// side-effects système) aux candidats ni aux travailleurs. On garde : les
// notifications internes RH, l'authentification (magic link), les accusés/
// confirmations (reçus d'une action de la personne) et TOUS les envois manuels.
//
// Mécanisme : seuls les envois explicitement taggés `automated: true` (posé
// uniquement sur les 6 envois d'outreach : rappel entretien, convocation,
// refus, offre, relance signature, notice de fin) sont concernés. Tout le reste
// n'est jamais taggé et passe donc toujours.
//
// Sécurité : bloqué par DÉFAUT (flag absent / ≠ true) → aucun envoi auto ne part
// tant que Karim ne le réactive pas explicitement dans /admin/settings.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export interface BlockedOutboundInfo {
  to: string | string[];
  toName?: string;
  subject: string;
  source?: string;
  candidateId?: string;
  employeeId?: string;
}

// Karim 2026-07-05 : EXCEPTION explicite au kill-switch. Un envoi AUTOMATIQUE
// vers un candidat/travailleur reste bloqué par défaut, SAUF si sa `source`
// figure dans cette liste blanche. Seule exception autorisée par Karim : le mail
// RÉCAPITULATIF + CONFIRMATION envoyé au candidat à la fin de son formulaire
// d'embauche (relecture de toutes ses données + bouton « Je confirme »). Toute
// autre source d'outreach automatique reste bloquée comme avant.
//
// Karim 2026-07-05 : 2e exception — le mail de BIENVENUE + mini-questionnaire
// envoyé au nouveau travailleur JUSTE APRÈS la signature de son contrat
// (source `worker_welcome_questionnaire`). Envoi automatique assumé par Karim,
// au même titre que le récap candidat.
const AUTO_ALLOWED_SOURCES = new Set<string>([
  "candidate_recap_confirm",
  "worker_welcome_questionnaire",
]);

/**
 * Retourne true si un envoi taggé `automated` doit être BLOQUÉ.
 * Non taggé → jamais bloqué. Source en liste blanche → jamais bloqué (exception
 * Karim 2026-07-05). Taggé + flag org non explicitement `true` → bloqué.
 */
export async function isAutoOutboundBlocked(
  automated: boolean | undefined,
  source?: string,
): Promise<boolean> {
  // Exception décidée par Karim (2026-07-05) : le récap+confirmation candidat
  // passe toujours, même tagué automated:true.
  if (source && AUTO_ALLOWED_SOURCES.has(source)) return false;
  if (!automated) return false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("org_settings")
      .select("auto_outbound_to_people_enabled")
      .eq("id", 1)
      .maybeSingle();
    const enabled =
      (data as { auto_outbound_to_people_enabled?: boolean } | null)?.auto_outbound_to_people_enabled === true;
    return !enabled;
  } catch {
    // Colonne absente (avant migration) ou erreur : sécurité = bloqué.
    return true;
  }
}

/**
 * Journalise l'envoi supprimé + notifie l'admin/RH (par personne concernée) avec
 * un lien vers la ressource pour l'envoyer manuellement s'il le souhaite.
 */
export async function reportBlockedOutbound(info: BlockedOutboundInfo): Promise<void> {
  const to = Array.isArray(info.to) ? info.to.join(", ") : info.to;
  const who = info.toName || to || "destinataire";

  try {
    const { logOutboundMail } = await import("@/lib/outbound-mails-log");
    await logOutboundMail({
      to: info.to,
      recipientName: info.toName,
      subject: info.subject,
      // Karim 2026-07-04 (debug) : source INVARIANTE 'auto-outbound-blocked' pour
      // que le health-check puisse exclure ces blocages du compteur de pannes
      // (avant, la vraie source ex. 'signature_reminder' etait conservee et le
      // filtre ne les excluait pas -> faux incidents). L'origine reste dans le message.
      source: "auto-outbound-blocked",
      candidateId: info.candidateId,
      employeeId: info.employeeId,
      deliveryProvider: "none",
      status: "failed",
      errorMessage: `Bloqué (kill-switch)${info.source ? ` — origine: ${info.source}` : ""} : envoi automatique vers candidat/travailleur désactivé.`,
    });
  } catch {
    /* best-effort */
  }

  try {
    const { notifyRoles } = await import("@/lib/notify");
    const link = info.employeeId
      ? `/planning/employees/${info.employeeId}`
      : info.candidateId
        ? `/rh/candidates/${info.candidateId}`
        : "/rh/mails";
    await notifyRoles(["admin", "rh"], {
      kind: "auto_outbound_blocked",
      title: `Email auto non envoyé à ${who}`,
      body: `« ${info.subject} » — envoi automatique désactivé. À envoyer manuellement si nécessaire.`,
      link,
      data: {
        subject: info.subject,
        source: info.source ?? null,
        to,
        candidateId: info.candidateId ?? null,
        employeeId: info.employeeId ?? null,
      },
    });
  } catch (e) {
    console.warn("[outbound-guard] notify KO:", (e as Error).message);
  }
}
