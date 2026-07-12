// GET /api/cron/training-drip
//
// Karim 2026-07-12 : PROGRAMME DE FORMATION. (1) Auto-enrôle les NOUVELLES recrues
// (start_date >= date de lancement, pour ne pas spammer l'existant) et leur envoie
// la section 1 le 1er jour à 9h. (2) Envoie la section suivante à 9h (next_send_at
// échu). Le bouton « hâte d'apprendre » du travailleur envoie, lui, hors cron.
// Cadence : horaire (les envois réels sont pilotés par next_send_at = 9h Bruxelles).
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureEnrollment, sendTrainingModule } from "@/lib/training/drip";
import { runTrainingLifecycle } from "@/lib/training/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// À partir de cette date d'embauche seulement (pas de rattrapage rétroactif massif).
const TRAINING_LAUNCH = "2026-07-12";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const hourBxl = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(now));

  // 1) Auto-enrôlement des nouvelles recrues (embauchées depuis le lancement).
  let enrolled = 0;
  const { data: hires } = await admin
    .from("employees")
    .select("id, start_date")
    .eq("status", "active")
    .gte("start_date", TRAINING_LAUNCH)
    .lte("start_date", today);
  for (const h of (hires ?? []) as Array<{ id: string; start_date: string | null }>) {
    const { data: has } = await admin.from("training_enrollments").select("id").eq("employee_id", h.id).maybeSingle();
    if (has) continue;
    const enr = await ensureEnrollment(admin, h.id);
    if (enr) enrolled++;
  }

  // 2) Envois dus. Section suivante = current_seq + 1.
  const { data: enrRaw } = await admin
    .from("training_enrollments")
    .select("employee_id, current_seq, next_send_at, started_on, status")
    .eq("status", "active");
  const enrs = (enrRaw ?? []) as Array<{
    employee_id: string;
    current_seq: number;
    next_send_at: string | null;
    started_on: string;
    status: string;
  }>;

  let sent = 0;
  let done = 0;
  const errors: string[] = [];
  for (const e of enrs) {
    if (e.started_on > today) continue; // pas avant la prise de service
    const firstSend = e.current_seq === 0; // section 1 jamais envoyée
    const dueScheduled = e.next_send_at != null && new Date(e.next_send_at) <= now;
    // 1re section : le jour même dès 9h. Suivantes : quand next_send_at est échu.
    const due = dueScheduled || (firstSend && hourBxl >= 9);
    if (!due) continue;
    try {
      const r = await sendTrainingModule(admin, e.employee_id, e.current_seq + 1);
      if (r.done) done++;
      else if (r.ok) sent++;
      else errors.push(`${e.employee_id}: ${r.error}`);
    } catch (err) {
      errors.push(`${e.employee_id}: ${(err as Error).message}`);
    }
  }

  // 3) Cycle de vie : prises de pouls (15 j, contrats < 3 mois) + bilan de sortie
  //    (10-15 j avant fin de contrat). Une seule fois chacun (dédup en base).
  let lifecycle = { pouls: 0, exit: 0, errors: [] as string[] };
  try {
    lifecycle = await runTrainingLifecycle(admin);
  } catch (e) {
    errors.push(`lifecycle: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, enrolled, sent, completed: done, lifecycle, errors });
}
