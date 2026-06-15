// GET /api/cron/incident-manager — Karim 2026-06-14.
//
// Agent d'astreinte auto-réparateur (incrément 1).
//
// Boucle : détecte les pannes système (mêmes détecteurs que system-health) ->
// ouvre/maj un incident (déduplication par signature) -> tente une réparation
// automatique déterministe (playbook sûr) -> résout ou escalade.
//
// Anti-spam : tant qu'un incident est `open`, on incrémente `occurrences` SANS
// re-notifier. Une notif part UNIQUEMENT sur transition : 1ʳᵉ escalade, ou
// résolution. Résolution = notif riche (modèle de réparation, problème, cause,
// solution, prévention). Échec = notif « non réglé, nécessite explication ».
//
// L'agent AGIT SEUL sur les playbooks (actions réversibles : relancer un cron de
// rattrapage, fermer des sessions orphelines). Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runHealthChecks, type Issue } from "@/lib/system/health-checks";
import { runPlaybook, type PlaybookOutcome } from "@/lib/incident/playbooks";
import { getActiveLearning, isAutoPaused } from "@/lib/incident/learnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IncidentRow = {
  id: string;
  signature: string;
  status: string;
  occurrences: number;
  severity: string;
  attempts: unknown[];
  // ... autres colonnes non nécessaires ici
};

type AdminClient = ReturnType<typeof createAdminClient>;

async function notifyAdmins(
  admin: AdminClient,
  payload: { kind: string; title: string; body: string; data: Record<string, unknown>; link: string },
): Promise<number> {
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const ids = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (ids.length === 0) return 0;
  // Karim 2026-06-14 : on insère 1 notif par admin PUIS on fixe le `link` vers
  // l'écran QCM de l'incident. SANS link, le clic sur la PUSH retombait sur "/"
  // (= accueil/planning) via sw.js `data.link || "/"`. Le trigger Postgres
  // déclenche le push automatiquement après l'insert.
  let notified = 0;
  for (const rid of ids) {
    const { data: ins } = await admin
      .from("notifications")
      .insert({
        recipient_id: rid,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      })
      .select("id")
      .single();
    if (!ins) continue;
    const id = (ins as { id: string }).id;
    await admin.from("notifications").update({ link: payload.link }).eq("id", id);
    notified++;
  }
  return notified;
}

function resolutionBody(issue: Issue, o: PlaybookOutcome): string {
  return [
    `Problème : ${issue.problem}`,
    `Cause : ${o.cause}`,
    `Solution appliquée : ${o.solution}`,
    `Prévention : ${o.prevention}`,
    `Modèle de réparation : ${o.model}`,
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1) Détection (lecture seule).
  const issues = await runHealthChecks();
  // On agit sur les pannes critiques/alertes ; on ignore les 'info' (à corriger
  // manuellement, pas une panne).
  const actionable = issues.filter((i) => i.severity === "critical" || i.severity === "warning");
  const currentSigs = new Set<string>(actionable.map((i) => i.key));

  // 2) Incidents ouverts existants.
  const { data: openRaw } = await admin
    .from("incidents").select("id, signature, status, occurrences, severity, attempts")
    .eq("status", "open");
  const openIncidents = (openRaw ?? []) as IncidentRow[];
  const openBySig = new Map(openIncidents.map((i) => [i.signature, i]));

  // Interrupteur global « Pause auto » : si actif, l'agent n'applique aucune
  // règle apprise (revient au comportement par défaut = notifier).
  const autoPaused = await isAutoPaused();

  const summary = {
    detected: actionable.length,
    opened: 0,
    repaired: 0,
    escalated: 0,
    recovered: 0,
    ignored: 0,
    notified: 0,
  };

  // 3) Pour chaque panne actuelle : créer/maj incident, tenter réparation.
  for (const issue of actionable) {
    // Consigne apprise « gérer en silence » (ignore_auto) : on clôt sans notifier.
    if (!autoPaused) {
      const learning = await getActiveLearning(issue.key);
      if (learning?.mode === "auto" && learning.chosen_option === "ignore_auto") {
        const existingOpen = openBySig.get(issue.key);
        if (existingOpen) {
          await admin.from("incidents").update({
            status: "resolved",
            resolved_at: nowIso,
            repair_model: "learned:ignore",
            resolution: {
              cause: issue.problem,
              solution: "Géré en silence sur ta consigne (règle apprise).",
              prevention: "Ce type de panne est en sourdine — révocable à tout moment.",
            },
          }).eq("id", existingOpen.id);
        }
        summary.ignored++;
        continue; // ni escalade ni notif
      }
    }

    const existing = openBySig.get(issue.key);
    let incidentId: string;
    let isNew = false;

    if (existing) {
      incidentId = existing.id;
      await admin.from("incidents").update({
        occurrences: (existing.occurrences ?? 1) + 1,
        last_seen: nowIso,
        severity: issue.severity,
        title: issue.title,
        problem: issue.problem,
      }).eq("id", incidentId);
    } else {
      const { data: ins } = await admin.from("incidents").insert({
        signature: issue.key,
        source: "system_health",
        severity: issue.severity,
        title: issue.title,
        problem: issue.problem,
        status: "open",
      }).select("id").single();
      if (!ins) continue; // course perdue (autre run) -> skip ce tick
      incidentId = (ins as { id: string }).id;
      isNew = true;
      summary.opened++;
    }

    // 4) Tentative de réparation déterministe (l'agent agit seul).
    const outcome = await runPlaybook(issue);

    // Journalise la tentative.
    const attempt = {
      at: nowIso,
      model: outcome?.model ?? "none",
      fixed: outcome?.fixed ?? false,
      detail: outcome?.detail ?? null,
    };
    const prevAttempts = Array.isArray(existing?.attempts) ? existing!.attempts : [];
    await admin.from("incidents").update({
      attempts: [...prevAttempts, attempt],
      repair_model: outcome?.model ?? null,
    }).eq("id", incidentId);

    if (outcome?.fixed) {
      // Résolu -> clôture + notif riche.
      await admin.from("incidents").update({
        status: "resolved",
        resolved_at: nowIso,
        repair_model: outcome.model,
        resolution: { cause: outcome.cause, solution: outcome.solution, prevention: outcome.prevention },
        last_error: null,
      }).eq("id", incidentId);
      summary.repaired++;
      summary.notified += await notifyAdmins(admin, {
        kind: "incident_resolved",
        title: `✅ Auto-réparation : ${issue.title}`,
        body: resolutionBody(issue, outcome),
        data: { incident_id: incidentId, signature: issue.key, model: outcome.model, auto: true },
        link: `/admin/incidents/${incidentId}`,
      });
    } else if (isNew) {
      // Pas réparé ET nouveau -> 1ʳᵉ escalade (une seule fois, pas de re-spam ensuite).
      await admin.from("incidents").update({
        last_error: outcome ? "playbook n'a pas résolu" : "aucun playbook automatique",
      }).eq("id", incidentId);
      summary.escalated++;
      const reco = outcome?.solution ?? issue.solution;
      // Règle notif : objet précis (issue.problem) + lien direct vers l'emplacement
      // à corriger (issue.link) quand il existe, en plus du lien incident/QCM.
      summary.notified += await notifyAdmins(admin, {
        kind: "incident_unresolved",
        title: `❌ Incident non réglé : ${issue.title}`,
        body: [
          `Problème : ${issue.problem}`,
          `Solution recommandée : ${reco}`,
          issue.link ? `📍 À corriger directement : ${issue.link}` : "",
          "⚠️ L'auto-réparation n'a pas suffi — dis-moi comment gérer ça (clique).",
        ].filter(Boolean).join("\n"),
        data: { incident_id: incidentId, signature: issue.key, needs_human: true, fix_link: issue.link ?? null },
        link: `/admin/incidents/${incidentId}`,
      });
    }
    // existing + non réparé -> on a déjà escaladé au 1er coup : pas de re-notif (dédup).
  }

  // 5) Rétablissement : un incident ouvert dont la panne a disparu -> résolu.
  for (const inc of openIncidents) {
    if (currentSigs.has(inc.signature)) continue; // toujours présent, traité plus haut
    await admin.from("incidents").update({
      status: "resolved",
      resolved_at: nowIso,
      repair_model: "auto_recovered",
      resolution: { cause: "Panne disparue d'elle-même au contrôle suivant.", solution: "Aucune action requise.", prevention: "Surveillance continue maintenue." },
    }).eq("id", inc.id);
    summary.recovered++;
    summary.notified += await notifyAdmins(admin, {
      kind: "incident_resolved",
      title: `✅ Rentré dans l'ordre : ${inc.signature}`,
      body: "La panne précédemment détectée n'est plus présente — incident clôturé automatiquement.",
      data: { incident_id: inc.id, signature: inc.signature, auto_recovered: true },
      link: `/admin/incidents/${inc.id}`,
    });
  }

  return NextResponse.json({ ok: true, ...summary });
}
