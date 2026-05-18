import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { computeCandidateScore } from "@/lib/scoring/candidate-match-score";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Karim 18/05 : recalcule match_score quotidiennement (la fraicheur evolue
// avec le temps). Egalement appele apres chaque sync GF pour les nouveaux.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Charge tout en batch
  const PAGE = 1000;
  let offset = 0;
  let total = 0;
  while (true) {
    const { data, error } = await admin
      .from("candidates")
      .select("id, city, birth_date, langs, applied_at")
      .range(offset, offset + PAGE - 1)
      .order("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as Array<{
      id: string;
      city: string | null;
      birth_date: string | null;
      langs: Record<string, unknown> | null;
      applied_at: string | null;
    }>;
    if (rows.length === 0) break;
    // Update par lots de 100
    for (const r of rows) {
      const { score, breakdown } = computeCandidateScore(r);
      await admin
        .from("candidates")
        .update({
          match_score: score,
          match_breakdown: breakdown,
          match_score_computed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      total += 1;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  return NextResponse.json({ ok: true, rescored: total });
}
