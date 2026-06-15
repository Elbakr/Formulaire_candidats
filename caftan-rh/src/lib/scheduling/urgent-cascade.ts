// Cascade de remplacement urgent (server-only).
//
// Flux complet :
//   1. createUrgentReinforcement() cree une reinforcement_requests is_urgent=true
//      en statut 'open', notifie TOUS les RH (kind 'urgent_replacement_rh') et
//      pose un timer implicite : la cascade ne demarre que si AUCUN RH n'a
//      accuse reception sous `reinforcement_rh_timeout_minutes`.
//   2. acknowledgeUrgent() : un RH accuse reception manuellement -> rh_acknowledged_at
//      est pose, la cascade NE demarre PAS (le RH gere a la main).
//   3. advanceCascades() (appelee par le cron /api/cron/reinforcement-cascade-next) :
//        a. demande urgente 'open', non acquittee, et creee depuis > rh_timeout
//           -> demarrage cascade : 1re proposition au meilleur candidat dispo.
//        b. proposition en cours expiree (interval ecoule) sans reponse
//           -> proposition au candidat SUIVANT non encore sollicite.
//        c. plus de candidat -> statut 'exhausted', notifie le RH.
//   4. acceptUrgentOffer() : l'employe accepte -> statut 'accepted', les autres
//      propositions en cours sont marquees 'superseded', le RH est notifie.
//
// Tout est trace dans reinforcement_proposal_log. Le cron est idempotent :
// on ne re-notifie jamais 2x le meme employe (verif via le log), et on borne le
// nombre total de candidats sollicites (MAX_CANDIDATES) pour eviter toute boucle.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getAvailableEmployeesForSlot } from "@/lib/scheduling/employee-availability";
import { sendPushToProfile } from "@/lib/push-notify";

const DEFAULT_RH_TIMEOUT_MIN = 20;
const DEFAULT_CASCADE_INTERVAL_MIN = 5;
// Garde-fou dur : on ne sollicitera jamais plus de candidats que ca, meme si
// getAvailableEmployeesForSlot renvoie une liste plus longue.
const MAX_CANDIDATES = 30;

type Admin = ReturnType<typeof createAdminClient>;

type ReinforcementRow = {
  id: string;
  requester_profile_id: string | null;
  site_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
  status: string;
  is_urgent: boolean | null;
  rh_acknowledged_at: string | null;
  cascade_active: boolean | null;
  current_proposal_id: string | null;
  created_at: string;
  site?: { code: string; name: string } | null;
};

type ProposalLogRow = {
  id: string;
  reinforcement_id: string;
  employee_id: string | null;
  sequence_order: number | null;
  status: string;
  proposed_at: string;
  expires_at: string | null;
  responded_at: string | null;
  response: string | null;
};

type EmployeeScore = { employee_id: string; global_score: number | null; reliability_pct: number | null };

// --- settings -------------------------------------------------------------

async function readCascadeSettings(
  admin: Admin,
): Promise<{ rhTimeoutMin: number; intervalMin: number }> {
  try {
    const { data } = await admin
      .from("org_settings")
      .select("reinforcement_rh_timeout_minutes, reinforcement_cascade_interval_minutes")
      .eq("id", 1)
      .maybeSingle();
    const row = (data ?? {}) as {
      reinforcement_rh_timeout_minutes?: number | null;
      reinforcement_cascade_interval_minutes?: number | null;
    };
    return {
      rhTimeoutMin: Number(row.reinforcement_rh_timeout_minutes ?? DEFAULT_RH_TIMEOUT_MIN) || DEFAULT_RH_TIMEOUT_MIN,
      intervalMin:
        Number(row.reinforcement_cascade_interval_minutes ?? DEFAULT_CASCADE_INTERVAL_MIN) ||
        DEFAULT_CASCADE_INTERVAL_MIN,
    };
  } catch {
    return { rhTimeoutMin: DEFAULT_RH_TIMEOUT_MIN, intervalMin: DEFAULT_CASCADE_INTERVAL_MIN };
  }
}

// --- helpers --------------------------------------------------------------

function fmtDateFr(dateISO: string): string {
  return new Date(dateISO + "T00:00:00").toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

async function fetchRhRecipients(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id, role").in("role", ["admin", "rh"]);
  return ((data ?? []) as { id: string }[]).map((p) => p.id);
}

/** Notifie tous les RH/admins (notification persistante + push best-effort). */
async function notifyRh(
  admin: Admin,
  args: { kind: string; title: string; body: string; link: string; data: Record<string, unknown> },
): Promise<void> {
  const recipients = await fetchRhRecipients(admin);
  if (recipients.length === 0) return;
  await admin.from("notifications").insert(
    recipients.map((rid) => ({
      recipient_id: rid,
      kind: args.kind,
      title: args.title,
      body: args.body,
      link: args.link,
      data: args.data,
    })),
  );
  // Le trigger Postgres envoie deja le push web a partir de l'INSERT notification,
  // mais on force aussi sendPushToProfile pour la priorite 'urgent'.
  await Promise.all(
    recipients.map((rid) =>
      sendPushToProfile(rid, {
        title: args.title,
        body: args.body,
        link: args.link,
        priority: "urgent",
        tag: `urgent-reinforcement-${String(args.data.reinforcement_id ?? "")}`,
      }).catch(() => undefined),
    ),
  );
}

// --- 1) creation ----------------------------------------------------------

export async function createUrgentReinforcement(args: {
  requesterProfileId: string | null;
  siteId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  position?: string | null;
  notes?: string | null;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const admin = createAdminClient();
  if (!args.date || !args.startTime || !args.endTime) {
    return { error: "Champs manquants (date / heures)." };
  }

  const { data, error } = await admin
    .from("reinforcement_requests")
    .insert({
      requester_profile_id: args.requesterProfileId,
      site_id: args.siteId,
      date: args.date,
      start_time: args.startTime,
      end_time: args.endTime,
      position: args.position ?? null,
      notes: args.notes ?? null,
      status: "open",
      is_urgent: true,
      cascade_active: false,
    })
    .select("id, site:sites(code, name)")
    .single();
  if (error || !data) return { error: error?.message ?? "Insertion echouee." };
  const row = data as unknown as { id: string; site: { code: string; name: string } | null };

  const dateFr = fmtDateFr(args.date);
  const link = `/planning/reinforcement?urgent=${row.id}`;
  await notifyRh(admin, {
    kind: "urgent_replacement_rh",
    title: "Remplacement URGENT a traiter",
    body: `${row.site?.name ?? "Site"} — ${dateFr} ${args.startTime.slice(0, 5)}–${args.endTime.slice(0, 5)}. Accuse reception sous ${DEFAULT_RH_TIMEOUT_MIN} min sinon la cascade auto demarre.`,
    link,
    data: { reinforcement_id: row.id },
  });

  return { ok: true, id: row.id };
}

// --- 2) accuse reception RH ----------------------------------------------

export async function acknowledgeUrgent(
  reinforcementId: string,
  profileId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("reinforcement_requests")
    .select("id, status, rh_acknowledged_at")
    .eq("id", reinforcementId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as { status: string; rh_acknowledged_at: string | null };
  if (r.rh_acknowledged_at) return { ok: true }; // idempotent
  if (!["open", "sent_to_employee"].includes(r.status)) {
    return { error: `Demande deja resolue (${r.status}).` };
  }
  const { error } = await admin
    .from("reinforcement_requests")
    .update({ rh_acknowledged_at: new Date().toISOString(), cascade_active: false })
    .eq("id", reinforcementId)
    .is("rh_acknowledged_at", null);
  if (error) return { error: error.message };
  return { ok: true };
}

// --- proposition a un employe (interne) ----------------------------------

async function proposeToEmployee(
  admin: Admin,
  req: ReinforcementRow,
  employee: { employee_id: string; full_name: string },
  sequenceOrder: number,
  intervalMin: number,
): Promise<boolean> {
  // Resolve profile_id de l'employe (necessaire pour notifier).
  const { data: emp } = await admin
    .from("employees")
    .select("id, profile_id, full_name")
    .eq("id", employee.employee_id)
    .maybeSingle();
  const profileId = (emp as { profile_id: string | null } | null)?.profile_id ?? null;
  if (!profileId) {
    // Pas de compte utilisateur -> on log un 'skipped' pour ne pas reboucler dessus.
    await admin.from("reinforcement_proposal_log").insert({
      reinforcement_id: req.id,
      employee_id: employee.employee_id,
      sequence_order: sequenceOrder,
      status: "skipped",
      response: "no_user_account",
    });
    return false;
  }

  const expiresAt = new Date(Date.now() + intervalMin * 60_000).toISOString();
  const { data: logIns, error: logErr } = await admin
    .from("reinforcement_proposal_log")
    .insert({
      reinforcement_id: req.id,
      employee_id: employee.employee_id,
      sequence_order: sequenceOrder,
      status: "sent",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (logErr || !logIns) return false;
  const proposalId = (logIns as { id: string }).id;

  // Pose l'employe propose + active la cascade sur la demande.
  await admin
    .from("reinforcement_requests")
    .update({
      proposed_employee_id: employee.employee_id,
      status: "sent_to_employee",
      proposed_at: new Date().toISOString(),
      responded_at: null,
      expires_at: expiresAt,
      cascade_active: true,
      current_proposal_id: proposalId,
    })
    .eq("id", req.id);

  const dateFr = fmtDateFr(req.date);
  const link = `/me/urgent-reinforcement/${req.id}`;
  await admin.from("notifications").insert({
    recipient_id: profileId,
    kind: "urgent_replacement_offer",
    title: "Renfort URGENT — peux-tu venir ?",
    body: `${req.site?.name ?? "Site"} — ${dateFr} ${req.start_time.slice(0, 5)}–${req.end_time.slice(0, 5)}. Reponds vite : la proposition passe au suivant dans ${intervalMin} min.`,
    link,
    data: { reinforcement_id: req.id, proposal_id: proposalId, expires_at: expiresAt, urgent: true },
  });
  await sendPushToProfile(profileId, {
    title: "Renfort URGENT",
    body: `${req.site?.name ?? "Site"} — ${dateFr} ${req.start_time.slice(0, 5)}–${req.end_time.slice(0, 5)}. Reponds OUI vite.`,
    link,
    priority: "urgent",
    tag: `urgent-reinforcement-${req.id}`,
  }).catch(() => undefined);

  return true;
}

// --- selection du prochain candidat --------------------------------------

async function pickNextCandidate(
  admin: Admin,
  req: ReinforcementRow,
  alreadyTried: Set<string>,
): Promise<{ employee_id: string; full_name: string } | null> {
  // Disponibilites declarees couvrant le creneau (contrat externe).
  const available = await getAvailableEmployeesForSlot({
    siteId: req.site_id,
    date: req.date,
    startTime: req.start_time,
    endTime: req.end_time,
  });
  const pool = available.filter((e) => !alreadyTried.has(e.employee_id));
  if (pool.length === 0) return null;

  // Tri fiabilite+performance : global_score DESC puis reliability_pct DESC.
  const ids = pool.map((e) => e.employee_id);
  const { data: scoresRaw } = await admin
    .from("employee_scores")
    .select("employee_id, global_score, reliability_pct")
    .in("employee_id", ids);
  const scoreById = new Map<string, EmployeeScore>();
  for (const s of (scoresRaw ?? []) as EmployeeScore[]) scoreById.set(s.employee_id, s);

  pool.sort((a, b) => {
    const sa = scoreById.get(a.employee_id);
    const sb = scoreById.get(b.employee_id);
    const ga = Number(sa?.global_score ?? -1);
    const gb = Number(sb?.global_score ?? -1);
    if (ga !== gb) return gb - ga;
    const ra = Number(sa?.reliability_pct ?? -1);
    const rb = Number(sb?.reliability_pct ?? -1);
    if (ra !== rb) return rb - ra;
    return a.full_name.localeCompare(b.full_name);
  });

  return pool[0] ?? null;
}

// --- 3) avancement de la cascade (cron) ----------------------------------

export async function advanceCascades(): Promise<{
  scanned: number;
  started: number;
  advanced: number;
  exhausted: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  const { rhTimeoutMin, intervalMin } = await readCascadeSettings(admin);
  const now = Date.now();

  // Demandes urgentes encore "vivantes" (pas accepted/cancelled/expired/covered...).
  const { data: reqsRaw } = await admin
    .from("reinforcement_requests")
    .select(
      `id, requester_profile_id, site_id, date, start_time, end_time, position, status,
       is_urgent, rh_acknowledged_at, cascade_active, current_proposal_id, created_at,
       site:sites(code, name)`,
    )
    .eq("is_urgent", true)
    .in("status", ["open", "sent_to_employee"]);
  const reqs = (reqsRaw ?? []) as unknown as ReinforcementRow[];

  const summary = { scanned: reqs.length, started: 0, advanced: 0, exhausted: 0, skipped: 0 };

  for (const req of reqs) {
    // RH a accuse reception -> il gere a la main, on ne touche pas.
    if (req.rh_acknowledged_at) {
      summary.skipped += 1;
      continue;
    }

    // Liste des employes deja sollicites (anti double-envoi + borne).
    const { data: logRaw } = await admin
      .from("reinforcement_proposal_log")
      .select("id, employee_id, sequence_order, status, expires_at")
      .eq("reinforcement_id", req.id)
      .order("sequence_order", { ascending: true });
    const logs = (logRaw ?? []) as ProposalLogRow[];
    const tried = new Set<string>(logs.map((l) => l.employee_id).filter((x): x is string => !!x));
    const nextOrder = logs.length;

    // Garde-fou dur : trop de candidats deja sollicites -> on epuise.
    if (nextOrder >= MAX_CANDIDATES) {
      if (req.status !== "open") {
        await admin
          .from("reinforcement_requests")
          .update({ status: "open", cascade_active: false, current_proposal_id: null })
          .eq("id", req.id);
      }
      summary.exhausted += 1;
      continue;
    }

    // Cas A : statut 'open'. Soit la cascade n'a jamais demarre (on attend la
    // fin de la fenetre RH), soit une proposition vient d'etre declinee/reouverte
    // par l'employe -> on enchaine immediatement sur le candidat suivant.
    if (req.status === "open") {
      const cascadeNeverStarted = nextOrder === 0 && !req.cascade_active;
      if (cascadeNeverStarted) {
        const ageMin = (now - new Date(req.created_at).getTime()) / 60_000;
        if (ageMin < rhTimeoutMin) {
          // Encore dans la fenetre RH, on attend l'accuse de reception manuel.
          summary.skipped += 1;
          continue;
        }
      }
      const candidate = await pickNextCandidate(admin, req, tried);
      if (!candidate) {
        await admin
          .from("reinforcement_requests")
          .update({ status: "open", cascade_active: false, current_proposal_id: null })
          .eq("id", req.id);
        await notifyRh(admin, {
          kind: "urgent_replacement_exhausted",
          title: "Renfort urgent : aucun candidat dispo",
          body: `${req.site?.name ?? "Site"} — ${fmtDateFr(req.date)} ${req.start_time.slice(0, 5)}–${req.end_time.slice(0, 5)} : aucun employe disponible. Intervention manuelle requise.`,
          link: `/planning/reinforcement?urgent=${req.id}`,
          data: { reinforcement_id: req.id },
        });
        summary.exhausted += 1;
        continue;
      }
      const sent = await proposeToEmployee(admin, req, candidate, nextOrder, intervalMin);
      if (sent) {
        if (cascadeNeverStarted) summary.started += 1;
        else summary.advanced += 1;
      }
      continue;
    }

    // Cas B : une proposition est en cours -> a-t-elle expire ?
    if (req.status === "sent_to_employee") {
      const current = logs.find((l) => l.id === req.current_proposal_id) ?? logs[logs.length - 1];
      const expiresAt = current?.expires_at ? new Date(current.expires_at).getTime() : 0;
      // Pas encore expiree -> on laisse l'employe repondre.
      if (current && current.status === "sent" && expiresAt > now) {
        summary.skipped += 1;
        continue;
      }
      // Expiree sans acceptation -> marque la proposition expiree, passe au suivant.
      if (current && current.status === "sent") {
        await admin
          .from("reinforcement_proposal_log")
          .update({ status: "expired", responded_at: new Date().toISOString(), response: "timeout" })
          .eq("id", current.id)
          .eq("status", "sent");
      }
      const candidate = await pickNextCandidate(admin, req, tried);
      if (!candidate) {
        await admin
          .from("reinforcement_requests")
          .update({ status: "open", cascade_active: false, current_proposal_id: null })
          .eq("id", req.id);
        await notifyRh(admin, {
          kind: "urgent_replacement_exhausted",
          title: "Renfort urgent : plus de candidat",
          body: `${req.site?.name ?? "Site"} — ${fmtDateFr(req.date)} ${req.start_time.slice(0, 5)}–${req.end_time.slice(0, 5)} : tous les employes disponibles ont ete sollicites sans accord. Intervention manuelle requise.`,
          link: `/planning/reinforcement?urgent=${req.id}`,
          data: { reinforcement_id: req.id },
        });
        summary.exhausted += 1;
        continue;
      }
      const sent = await proposeToEmployee(admin, req, candidate, nextOrder, intervalMin);
      if (sent) summary.advanced += 1;
      continue;
    }
  }

  return summary;
}

// --- 4) acceptation employe (1 clic) -------------------------------------

export async function acceptUrgentOffer(
  reinforcementId: string,
  employeeId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("reinforcement_requests")
    .select(
      `id, requester_profile_id, site_id, date, start_time, end_time, position, status,
       proposed_employee_id, current_proposal_id, site:sites(code, name)`,
    )
    .eq("id", reinforcementId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as unknown as ReinforcementRow & { proposed_employee_id: string | null };

  if (r.status !== "sent_to_employee") {
    return { error: `Cette proposition n'est plus active (${r.status}).` };
  }
  if (r.proposed_employee_id !== employeeId) {
    return { error: "Cette proposition ne t'est plus adressee (passee au suivant)." };
  }

  // Recupere l'employe + sa pause par defaut pour creer le shift.
  const { data: empRow } = await admin
    .from("employees")
    .select("id, full_name, default_pause_minutes")
    .eq("id", employeeId)
    .maybeSingle();
  if (!empRow) return { error: "Employe introuvable." };
  const emp = empRow as { id: string; full_name: string; default_pause_minutes: number | null };

  // Cree le shift resultant.
  const { data: shiftIns, error: insErr } = await admin
    .from("shifts")
    .insert({
      employee_id: emp.id,
      site_id: r.site_id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      break_minutes: emp.default_pause_minutes ?? 30,
      position: r.position,
      status: "planned",
      created_by: r.requester_profile_id,
      notes: "Renfort urgent accepte (cascade)",
    })
    .select("id")
    .single();
  if (insErr || !shiftIns) return { error: insErr?.message ?? "Creation shift echouee." };
  const shiftId = (shiftIns as { id: string }).id;

  const nowISO = new Date().toISOString();

  // Marque la demande acceptee. (Le trigger existant cancel_redundant_* annule
  // les doublons sur le meme creneau.)
  await admin
    .from("reinforcement_requests")
    .update({
      status: "accepted",
      responded_at: nowISO,
      resulting_shift_id: shiftId,
      cascade_active: false,
    })
    .eq("id", r.id)
    .eq("status", "sent_to_employee"); // garde anti-double

  // Log : marque la proposition courante acceptee, annule les autres en cours.
  if (r.current_proposal_id) {
    await admin
      .from("reinforcement_proposal_log")
      .update({ status: "accepted", responded_at: nowISO, response: "accepted" })
      .eq("id", r.current_proposal_id);
  }
  await admin
    .from("reinforcement_proposal_log")
    .update({ status: "superseded", responded_at: nowISO })
    .eq("reinforcement_id", r.id)
    .eq("status", "sent");

  // Notifie le RH demandeur.
  await notifyRh(admin, {
    kind: "urgent_replacement_filled",
    title: "Renfort urgent comble",
    body: `${emp.full_name} a accepte le renfort ${r.site?.name ?? ""} ${fmtDateFr(r.date)} ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}. Shift cree.`,
    link: `/planning/reinforcement?urgent=${r.id}`,
    data: { reinforcement_id: r.id, shift_id: shiftId, employee_id: emp.id },
  });

  return { ok: true };
}
