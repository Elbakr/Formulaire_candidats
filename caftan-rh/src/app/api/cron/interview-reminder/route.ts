// Cron — Rappel entretien candidat 24 h avant
//
// Cadence recommandée : toutes les heures (0 * * * *)
// Fenêtre : entretiens status=scheduled dont scheduled_at ∈ [now+23h, now+25h]
// → chaque entretien ne passe qu'UNE FOIS dans la fenêtre si le cron tourne
//   à cadence >= toutes les 2 h. Pas de nouvelle colonne nécessaire.
//
// Auth : GET + header "Authorization: Bearer ${CRON_SECRET}"

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendInterviewReminder } from "@/lib/emails";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function buildWhereLabel(type: string, location: string | null, meetingUrl: string | null): string {
  if (type === "video") return meetingUrl || "Lien envoyé séparément";
  if (type === "phone") return `Téléphone ${location ?? ""}`.trim();
  return location || "Sur place — adresse communiquée";
}

export async function GET(request: NextRequest) {
  // Auth Bearer CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();

  // Fenêtre [now+23h, now+25h] — un entretien ne traverse la fenêtre qu'une fois
  const windowStart = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data: interviewsRaw, error: fetchErr } = await admin
    .from("interviews")
    .select(
      `id, scheduled_at, duration_min, type, location, meeting_url, status,
       application:applications(
         id, candidate_id,
         candidate:candidates(id, full_name, email)
       )`,
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd);

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  type CandidateShape = { id: string; full_name: string; email: string } | null;
  type ApplicationShape = { id: string; candidate_id: string | null; candidate: CandidateShape } | null;
  type InterviewRow = {
    id: string;
    scheduled_at: string;
    duration_min: number;
    type: string;
    location: string | null;
    meeting_url: string | null;
    status: string;
    application: ApplicationShape;
  };

  const interviews = (interviewsRaw ?? []) as unknown as InterviewRow[];

  const results = { checked: interviews.length, reminded: 0, skipped: 0, errors: [] as string[] };

  for (const iv of interviews) {
    const app = iv.application;
    const candidate = app?.candidate;

    if (!candidate?.email) {
      results.skipped++;
      continue;
    }

    const whenLocal = formatDateTime(iv.scheduled_at);
    // NL : même string (format fr-BE heure — suffisant pour les deux langues)
    const whenLocalNl = whenLocal;
    const where = buildWhereLabel(iv.type, iv.location, iv.meeting_url);

    try {
      await sendInterviewReminder({
        to: candidate.email,
        fullName: candidate.full_name,
        whenLocal,
        whenLocalNl,
        location: where,
        type: iv.type,
        durationMin: iv.duration_min ?? 30,
        candidateId: app?.candidate_id ?? candidate.id,
        interviewId: iv.id,
      });
      results.reminded++;

      // Log dans messages (best-effort)
      if (app?.id) {
        try {
          await admin.from("messages").insert({
            application_id: app.id,
            direction: "outbound",
            subject: "Rappel entretien demain",
            body: `Rappel automatique : entretien demain le ${whenLocal} (${where}).`,
          });
        } catch {
          // best-effort : on ignore les erreurs de log
        }
      }
    } catch (e) {
      results.errors.push(`${iv.id}: ${(e as Error).message}`);
      results.skipped++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
