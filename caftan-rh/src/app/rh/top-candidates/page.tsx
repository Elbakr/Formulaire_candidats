import Link from "next/link";
import { ArrowRight, Sparkles, MapPin, Languages, Calendar, User } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

// Karim 18/05 : "denicher les meilleurs profils de la facon la plus
// intelligente qui soit". Page dediee qui liste les candidats tries
// par match_score DESC avec breakdown visuel + filtres par poste.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CandidateRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  applied_at: string | null;
  match_score: number | null;
  match_breakdown: {
    proximity: number;
    languages: number;
    age: number;
    freshness: number;
    city_label: string;
    age_value: number | null;
    langs_summary: string;
    days_since_applied: number | null;
  } | null;
};

function scoreColor(score: number | null): string {
  if (score === null) return "bg-ink-3/20 text-ink-3";
  if (score >= 80) return "bg-success text-white";
  if (score >= 60) return "bg-gold text-[#1a1a0d]";
  if (score >= 40) return "bg-warn text-white";
  return "bg-ink-3/30 text-ink-3";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "Non scoré";
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Bon";
  if (score >= 40) return "Moyen";
  return "Faible";
}

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
      "id, full_name, email, phone, city, applied_at, match_score, match_breakdown",
    )
    .gte("match_score", minScore)
    .order("match_score", { ascending: false })
    .order("applied_at", { ascending: false })
    .limit(limitN);

  const rows = (candidates ?? []) as CandidateRow[];

  // Comptes par bande
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
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-gold" />
            Top profils
          </h1>
          <p className="text-sm text-ink-2">
            Classement intelligent sur 4 axes : proximité, langues, âge, fraîcheur. Score sur 100.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
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

      <Card>
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 bg-surface-2 border-b border-line">
          {rows.length} candidat{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""} · score ≥ {minScore}
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">
            Aucun candidat avec un score ≥ {minScore}. Baisse le seuil ou relance le recalcul des scores.
          </div>
        ) : (
          <ul>
            {rows.map((c, idx) => {
              const b = c.match_breakdown;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 p-3 border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors"
                >
                  <div className="text-xs font-mono text-ink-3 w-6 text-right">{idx + 1}</div>
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-sm ${scoreColor(c.match_score)}`}
                    title={scoreLabel(c.match_score)}
                  >
                    {c.match_score ?? "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/rh/candidates/${c.id}`}
                      className="font-bold text-sm hover:text-gold-dark truncate block"
                    >
                      {c.full_name}
                    </Link>
                    <div className="text-xs text-ink-2 truncate">
                      {c.email ?? "—"} · {c.phone ?? "—"}
                    </div>
                    {b ? (
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                        <span className="inline-flex items-center gap-1 text-ink-3">
                          <MapPin className="h-3 w-3" />
                          {b.city_label} ({b.proximity}/25)
                        </span>
                        <span className="inline-flex items-center gap-1 text-ink-3">
                          <Languages className="h-3 w-3" />
                          {b.langs_summary} ({b.languages}/25)
                        </span>
                        <span className="inline-flex items-center gap-1 text-ink-3">
                          <User className="h-3 w-3" />
                          {b.age_value ?? "?"} ans ({b.age}/25)
                        </span>
                        <span className="inline-flex items-center gap-1 text-ink-3">
                          <Calendar className="h-3 w-3" />
                          {b.days_since_applied ?? "?"}j ({b.freshness}/25)
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={`/rh/candidates/${c.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gold-dark hover:underline shrink-0"
                  >
                    Fiche <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="text-[11px] text-ink-3">
        Barème (100 pts) : Proximité 25 + Langues 25 + Âge 25 + Fraîcheur 25.
        Recalcul périodique via <code className="font-mono">scripts/recompute-candidate-scores.mjs</code>.
        La fraîcheur évolue tous les jours, relance régulièrement.
      </div>
    </div>
  );
}
