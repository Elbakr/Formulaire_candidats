"use server";

// Smart scheduling — server action.
//
// proposeInterviewSlotsAction(applicationId) :
//   - Looks up the assigned manager (or falls back to the current RH user)
//   - Computes manager free slots over the next 14 days
//   - Builds a candidate context summary
//   - Calls runAgent({ task: 'scheduling', ... })
//   - Persists the proposal as an agent_action (kind=scheduling_proposal)
//   - Returns { ok, action_id?, slots?, error? }

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/ai/agent";
import {
  defaultSchedulingWindow,
  findCandidateAvailabilityHints,
  findManagerAvailability,
  type FreeSlot,
} from "@/lib/scheduling/availability";
import { logActivity } from "@/lib/activity";
import type {
  SchedulingInput,
  SchedulingOutput,
} from "@/lib/ai/prompts/scheduling.v1";

export type ProposeSlotsResult =
  | {
      ok: true;
      action_id: string;
      slots: SchedulingOutput["slots"];
      summary: string;
      cached?: boolean;
    }
  | { ok: false; error: string };

export async function proposeInterviewSlotsAction(
  applicationId: string,
): Promise<ProposeSlotsResult> {
  if (!applicationId) return { ok: false, error: "applicationId manquant." };
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();

  // Fetch application + assigned manager
  const { data: appRow, error: appErr } = await admin
    .from("applications")
    .select(
      "id, candidate_id, assigned_manager, candidate:candidates(id, full_name, email), job:jobs(id, title)",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appRow) {
    return { ok: false, error: "Candidature introuvable." };
  }

  type AppShape = {
    id: string;
    candidate_id: string;
    assigned_manager: string | null;
    candidate: { id?: string; full_name?: string; email?: string } | null;
    job: { id?: string; title?: string } | null;
  };
  const app = appRow as unknown as AppShape;

  const managerProfileId = app.assigned_manager ?? profile.id;

  // Manager name (best-effort)
  const { data: mgrRow } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", managerProfileId)
    .maybeSingle();
  const managerName =
    ((mgrRow as { full_name?: string } | null)?.full_name ?? null) ?? null;

  const window = defaultSchedulingWindow();
  let slots: FreeSlot[] = [];
  try {
    slots = await findManagerAvailability({
      managerProfileId,
      fromDate: window.from,
      toDate: window.to,
      slotMinutes: 30,
    });
  } catch (e) {
    return {
      ok: false,
      error: `Échec calcul dispos manager : ${(e as Error).message}`,
    };
  }

  if (slots.length === 0) {
    return {
      ok: false,
      error:
        "Aucun créneau libre dans les 14 prochains jours pour ce manager. Ajoute des shifts ou choisis un autre manager.",
    };
  }

  // Candidate context
  let candidateSummary = "";
  try {
    candidateSummary = await findCandidateAvailabilityHints(app.candidate_id);
  } catch {
    candidateSummary = `Nom : ${app.candidate?.full_name ?? "?"}`;
  }
  if (app.job?.title) {
    candidateSummary = `Poste visé : ${app.job.title}\n${candidateSummary}`;
  }

  // Run the AI
  const aiInput: SchedulingInput = {
    candidate_summary: candidateSummary,
    available_slots: slots.map((s) => ({
      date: s.date,
      start: s.start_time,
      end: s.end_time,
    })),
    num_slots_to_propose: 3,
    manager_name: managerName,
  };

  const ai = await runAgent<SchedulingInput, SchedulingOutput>({
    task: "scheduling",
    input: aiInput,
    context: { applicationId, candidateId: app.candidate_id },
    callerProfileId: profile.id,
  });

  if (!ai.ok || !ai.output) {
    return { ok: false, error: ai.error ?? "AI indisponible." };
  }

  // Validate output : keep only slots that exist in our free slots set
  const freeSet = new Set(slots.map((s) => `${s.date}|${s.start_time}|${s.end_time}`));
  const safeSlots = (ai.output.slots ?? [])
    .filter(
      (s) =>
        s &&
        typeof s.date === "string" &&
        typeof s.start_time === "string" &&
        typeof s.end_time === "string" &&
        freeSet.has(`${s.date}|${s.start_time}|${s.end_time}`),
    )
    .slice(0, 3);

  // If the AI returned junk (no overlap), fall back to picking 3 well-spread slots
  let finalSlots: SchedulingOutput["slots"];
  if (safeSlots.length === 0) {
    const fallback = pickFallbackSlots(slots, 3);
    finalSlots = fallback.map((s) => ({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      reasoning: "Créneau de secours (sortie IA invalide).",
    }));
  } else {
    finalSlots = safeSlots;
  }

  const summary = ai.output.summary ?? "Proposition de 3 créneaux.";

  // Persist as agent_action
  const { data: insRow, error: insErr } = await admin
    .from("agent_actions")
    .insert({
      kind: "scheduling_proposal",
      status: "proposed",
      payload: {
        slots: finalSlots,
        candidate_summary: candidateSummary,
        manager_id: managerProfileId,
        manager_name: managerName,
        candidate_name: app.candidate?.full_name ?? null,
        candidate_email: app.candidate?.email ?? null,
        job_title: app.job?.title ?? null,
        ai_summary: summary,
      },
      target_type: "application",
      target_id: applicationId,
      proposed_by_agent: "scheduler",
      ai_confidence: safeSlots.length > 0 ? 0.85 : 0.5,
    })
    .select("id")
    .single();

  if (insErr || !insRow) {
    return {
      ok: false,
      error: insErr?.message ?? "Insertion agent_actions échouée.",
    };
  }

  await logActivity({
    kind: "ai.scheduling.proposed",
    targetType: "application",
    targetId: applicationId,
    actorId: profile.id,
    description: `IA a proposé ${finalSlots.length} créneaux d'entretien.`,
    data: { agent_action_id: insRow.id, manager_id: managerProfileId },
  });

  revalidatePath(`/rh/candidates/${applicationId}`);
  revalidatePath("/rh/inbox");

  return {
    ok: true,
    action_id: insRow.id,
    slots: finalSlots,
    summary,
    cached: ai.cached,
  };
}

/** Pick well-spread slots when the AI output is unusable. */
function pickFallbackSlots(slots: FreeSlot[], n: number): FreeSlot[] {
  if (slots.length <= n) return slots.slice();
  // Group by date, then pick mid-morning / mid-afternoon variety
  const byDate = new Map<string, FreeSlot[]>();
  for (const s of slots) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }
  const dates = Array.from(byDate.keys()).sort();
  // Pick every Nth date so we cover the window
  const picked: FreeSlot[] = [];
  const step = Math.max(1, Math.floor(dates.length / n));
  for (let i = 0; i < dates.length && picked.length < n; i += step) {
    const arr = byDate.get(dates[i]) ?? [];
    if (arr.length === 0) continue;
    // alternate between morning preference and afternoon
    const wantAfternoon = picked.length % 2 === 1;
    const pickedSlot =
      arr.find((s) =>
        wantAfternoon ? s.start_time >= "14:00" : s.start_time >= "10:00" && s.start_time < "12:00",
      ) ?? arr[Math.floor(arr.length / 2)];
    picked.push(pickedSlot);
  }
  return picked;
}
