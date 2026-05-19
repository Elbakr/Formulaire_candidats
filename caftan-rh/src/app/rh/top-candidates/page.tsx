import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TopCandidatesList, type TopCandidateRow } from "./top-candidates-list";

// Karim 18/05 : "denicher les meilleurs profils".
// Karim 19/05 : selection multi + bulk mail via EmailJS (remplace l ancien
// mailto BCC qui ouvrait Outlook).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RawCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  match_score: number | null;
  match_breakdown: TopCandidateRow["match_breakdown"];
  applications: Array<{ id: string }> | null;
};

export default async function TopCandidatesPage(props: {
  searchParams: Promise<{ min?: string; limit?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { min, limit } = await props.searchParams;
  const minScore = Math.max(0, Math.min(100, Number(min ?? "60")));
  const limitN = Math.min(200, Math.max(10, Number(limit ?? "50")));

  const supabase = await createClient();
  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, email, phone, birth_date, match_score, match_breakdown, applications:applications(id)",
    )
    .gte("match_score", minScore)
    .order("match_score", { ascending: false })
    .order("applied_at", { ascending: false })
    .limit(limitN);

  const rows: TopCandidateRow[] = ((candidates ?? []) as RawCandidate[]).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    birth_date: c.birth_date,
    match_score: c.match_score,
    match_breakdown: c.match_breakdown,
    application_id: c.applications?.[0]?.id ?? null,
  }));

  const { data: stats } = await supabase
    .from("candidates")
    .select("match_score")
    .not("match_score", "is", null);
  const all = (stats ?? []) as Array<{ match_score: number }>;
  const buckets = {
    excellent: all.filter((s) => s.match_score >= 80).length,
    bon: all.filter((s) => s.match_score >= 60 && s.match_score < 80).length,
    moyen: all.filter((s) => s.match_score >= 40 && s.match_score < 60).length,
    faible: all.filter((s) => s.match_score < 40).length,
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-gold" />
            Top profils
          </h1>
          <p className="text-sm text-ink-2">
            Classement intelligent sur 4 axes : proximité, langues, âge, fraîcheur. Coche pour mail bulk.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-ink-3">Seuil :</span>
          {[40, 60, 70, 80].map((v) => (
            <Link
              key={v}
              href={`?min=${v}&limit=${limitN}`}
              className={`px-2 py-1 rounded border font-bold ${
                minScore === v ? "bg-gold text-[#1a1a0d] border-gold" : "border-line hover:bg-surface-2"
              }`}
            >
              ≥ {v}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Card>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Excellent (≥80)</div>
            <div className="text-2xl font-bold text-success">{buckets.excellent}</div>
          </div>
        </Card>
        <Card>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Bon (60-79)</div>
            <div className="text-2xl font-bold text-gold-dark">{buckets.bon}</div>
          </div>
        </Card>
        <Card>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Moyen (40-59)</div>
            <div className="text-2xl font-bold text-warn">{buckets.moyen}</div>
          </div>
        </Card>
        <Card>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Faible (&lt;40)</div>
            <div className="text-2xl font-bold text-ink-3">{buckets.faible}</div>
          </div>
        </Card>
      </div>

      <TopCandidatesList rows={rows} />

      <div className="text-[11px] text-ink-3">
        Barème (100 pts) : Proximité 25 + Langues 25 + Âge 25 + Fraîcheur 25.
        Recalcul périodique via <code className="font-mono">scripts/recompute-candidate-scores.mjs</code>.
      </div>
    </div>
  );
}
