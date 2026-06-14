// Karim 2026-06-14 : détecteurs de santé système, extraits de la route
// /api/cron/system-health pour être RÉUTILISÉS par l'agent d'astreinte
// (/api/cron/incident-manager). Chaque issue porte une `key` STABLE qui sert
// de signature de déduplication d'incident (le `title` varie avec les compteurs,
// pas la `key`).

import { createAdminClient } from "@/lib/supabase/server";

export type Severity = "critical" | "warning" | "info" | "ok";

export type HealthIssueKey =
  | "tuya_ingestion_stalled"
  | "crons_frozen"
  | "open_clocks_24h"
  | "failed_mails"
  | "anomalous_clocks"
  | "no_presence_daytime"
  | "unmapped_badges";

export type Issue = {
  key: HealthIssueKey;
  severity: Severity;
  title: string;
  problem: string;
  solution: string;
};

/**
 * Exécute tous les contrôles de santé système et renvoie la liste des problèmes
 * détectés (vide = tout va bien). Aucune écriture : lecture seule.
 */
export async function runHealthChecks(): Promise<Issue[]> {
  const admin = createAdminClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const hoursSince = (iso?: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : Infinity;
  const issues: Issue[] = [];

  // 1) Ingestion Tuya (pointage).
  const { data: lastTuya } = await admin
    .from("clock_entries").select("occurred_at").eq("source", "tuya")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  const tuyaAgeH = hoursSince((lastTuya as { occurred_at?: string } | null)?.occurred_at);
  if (tuyaAgeH > 12) {
    issues.push({
      key: "tuya_ingestion_stalled",
      severity: "critical",
      title: "Ingestion Tuya à l'arrêt",
      problem: `Aucun pointage Tuya depuis ${Math.round(tuyaAgeH)}h — les badges des employés ne sont plus enregistrés (présence et heures faussées).`,
      solution: "Vérifier que le cron tuya-poll tourne (workflow caftan-crons.yml doit être sur la branche par défaut du dépôt), puis relancer /api/cron/tuya-poll pour rattraper.",
    });
  }

  // 2) Crons figés (fraicheur du dernier sync).
  const { data: sync } = await admin
    .from("tuya_sync_state").select("last_sync_at")
    .order("last_sync_at", { ascending: false }).limit(1).maybeSingle();
  const syncAgeH = hoursSince((sync as { last_sync_at?: string } | null)?.last_sync_at);
  if (syncAgeH > 2) {
    issues.push({
      key: "crons_frozen",
      severity: "warning",
      title: "Crons possiblement à l'arrêt",
      problem: `Le dernier cycle de cron remonte à ${Math.round(syncAgeH)}h. Tout le pilote automatique (poll, sync, relances) peut être figé.`,
      solution: "Les workflows GitHub planifiés ne s'exécutent QUE depuis la branche par défaut. Mettre la branche par défaut sur celle qui contient caftan-crons.yml (ou copier le workflow sur main).",
    });
  }

  // 3) Pointages ouverts > 24h (OUT oublié).
  const { data: open } = await admin.from("clock_currently_in").select("employee_id, clock_in_at");
  const openRows = (open ?? []) as Array<{ employee_id: string; clock_in_at: string }>;
  const orphans = openRows.filter((o) => hoursSince(o.clock_in_at) > 24);
  if (orphans.length > 0) {
    issues.push({
      key: "open_clocks_24h",
      severity: "warning",
      title: `${orphans.length} pointage(s) ouvert(s) depuis >24h`,
      problem: `${orphans.length} employé(s) apparaissent "présents" depuis plus de 24h — un badge de sortie a été oublié.`,
      solution: "Lancer /api/cron/force-close-orphans : il ferme ces sessions avec une heure de sortie estimée (corrigeable par la RH).",
    });
  }

  // 4) Mails sortants en échec (7j).
  const { count: failedMails } = await admin
    .from("outbound_mails").select("id", { count: "exact", head: true })
    .eq("status", "failed").gte("sent_at", sevenDaysAgo);
  if ((failedMails ?? 0) > 0) {
    issues.push({
      key: "failed_mails",
      severity: "warning",
      title: `${failedMails} mail(s) en échec (7j)`,
      problem: `${failedMails} envoi(s) d'e-mail ont échoué cette semaine — des destinataires n'ont rien reçu.`,
      solution: "Vérifier la configuration d'envoi (Resend / EmailJS / SMTP) et les logs dans /rh/mails.",
    });
  }

  // 5) Pointages anormaux à corriger (7j).
  const { count: anom } = await admin
    .from("clock_entries").select("id", { count: "exact", head: true })
    .eq("is_anomalous", true).gte("occurred_at", sevenDaysAgo);
  if ((anom ?? 0) > 0) {
    issues.push({
      key: "anomalous_clocks",
      severity: "info",
      title: `${anom} pointage(s) à vérifier (7j)`,
      problem: `${anom} pointage(s) marqués anormaux (jours incomplets, sessions trop longues).`,
      solution: "Les corriger depuis l'écran de présence / la fiche prestations de l'employé.",
    });
  }

  // 6) Aucun présent en pleine journée ouvrée (signal d'ingestion KO).
  const bxHour = Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }));
  const bxDay = new Date().toLocaleString("en-US", { timeZone: "Europe/Brussels", weekday: "short" });
  const isWeekday = !["Sat", "Sun"].includes(bxDay);
  if (isWeekday && bxHour >= 10 && bxHour <= 18 && openRows.length === 0) {
    issues.push({
      key: "no_presence_daytime",
      severity: "warning",
      title: "Aucun présent en pleine journée",
      problem: "Personne n'est pointé alors qu'on est en horaire d'ouverture — anormal.",
      solution: "Probable arrêt de l'ingestion Tuya (voir ci-dessus) : relancer le poll et vérifier les crons.",
    });
  }

  // 7) Badges perdus (slot non mappé) — anti-récidive des OUT/IN manquants.
  // Karim 2026-06-14 : un badge dont le slot n'est pas mappé est droppé en
  // silence (sortie/entrée manquante). On remonte ceux des 3 derniers jours qui
  // n'ont TOUJOURS pas de mapping numérique actif.
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
  const { data: unmappedRaw } = await admin
    .from("tuya_unmapped_slots")
    .select("tuya_device_id, tuya_user_id, last_seen_at")
    .is("resolved_at", null)
    .gte("last_seen_at", threeDaysAgo);
  const unmapped = (unmappedRaw ?? []) as Array<{ tuya_device_id: string; tuya_user_id: string }>;
  if (unmapped.length > 0) {
    const { data: mapsRaw } = await admin
      .from("tuya_user_mapping")
      .select("tuya_device_id, tuya_user_id")
      .eq("is_active", true)
      .not("tuya_user_id", "is", null);
    const mapped = new Set(
      ((mapsRaw ?? []) as Array<{ tuya_device_id: string; tuya_user_id: string }>).map(
        (m) => `${m.tuya_device_id}|${m.tuya_user_id}`,
      ),
    );
    const stillUnmapped = unmapped.filter((u) => !mapped.has(`${u.tuya_device_id}|${u.tuya_user_id}`));
    if (stillUnmapped.length > 0) {
      const terminals = new Set(stillUnmapped.map((u) => u.tuya_device_id)).size;
      issues.push({
        key: "unmapped_badges",
        severity: "warning",
        title: `${stillUnmapped.length} badge(s) non capté(s) (slot non mappé)`,
        problem: `${stillUnmapped.length} passage(s) de badge sur ${terminals} terminal(aux) sont droppés faute de mapping — ce sont des entrées/sorties manquantes (cause des OUT manquants).`,
        solution: "Faire badger la personne puis mapper son slot en 1 clic dans /admin/tuya/logs. Une fois mappé, le badge est capté automatiquement.",
      });
    }
  }

  return issues;
}
