// Karim 2026-07-12 : panneau FORMATION sur la fiche admin. Progression, temps de
// lecture, motivation, examens, cohérence lecture↔examen, pouls, bilan de sortie, et
// une RECOMMANDATION de renouvellement (non bloquante). Server component.

import Link from "next/link";
import { GraduationCap, Star, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/server";
import { computeTrainingScore } from "@/lib/training/score";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
function Bar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-[11px] text-ink-2 mb-0.5">
        <span>{label}</span>
        <span className="font-bold">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line/60 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
function ratingStars(n: number | null) {
  const v = n ?? 0;
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3 w-3 ${i <= v ? "fill-gold text-gold" : "text-line"}`} />
      ))}
    </span>
  );
}

export async function TrainingPanel({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();
  const s = await computeTrainingScore(admin, employeeId);
  if (!s.hasEnrollment) return null;

  const recColor =
    s.recommendation === "favorable"
      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
      : s.recommendation === "mitige"
        ? "bg-amber-50 text-amber-900 border-amber-300"
        : s.recommendation === "vigilance"
          ? "bg-red-50 text-red-800 border-red-300"
          : "bg-surface-2 text-ink-2 border-line";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <GraduationCap className="h-4 w-4 text-gold-dark" />
        Formation & aide au renouvellement
        <Link href="/admin/training" className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-gold-dark hover:underline">
          <Pencil className="h-3 w-3" /> Éditer le manuel
        </Link>
        <span className="text-[11px] font-normal text-ink-3">
          Section {s.currentSeq}/{s.total}{s.status === "done" ? " · terminée 🎓" : ""}
        </span>
      </div>

      {/* Recommandation (non bloquante) */}
      <div className={`rounded-md border p-2.5 flex items-center gap-2 ${recColor}`}>
        <div className="text-2xl font-extrabold">{s.overall}</div>
        <div className="text-[12px] leading-tight">
          <div className="font-bold">Score global — {s.recommendationLabel}</div>
          <div className="opacity-80">Indicatif : la décision de renouvellement reste humaine.</div>
        </div>
      </div>

      {/* Détail des indices */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Bar label="Progression" value={s.progressionPct} />
        <Bar label="Motivation" value={s.motivation} />
        <Bar label={`Lecture${s.medianReadingSec != null ? ` (méd. ${s.medianReadingSec}s)` : ""}`} value={s.readingProfile} />
        <Bar label="Examens (moy.)" value={s.examAvg} />
        {s.coherence != null ? <Bar label="Cohérence lecture↔examen" value={s.coherence} /> : null}
        <Bar label="Sections confirmées" value={s.total ? Math.round((s.confirmedCount / s.total) * 100) : 0} />
      </div>

      {/* Examens */}
      {s.exams.length > 0 ? (
        <div className="border-t border-line pt-2">
          <div className="text-[11px] font-bold text-ink-2 mb-1">Examens (crescendo)</div>
          <div className="flex flex-wrap gap-1.5">
            {s.exams.map((e) => (
              <span
                key={e.module_seq}
                className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${e.pct >= 70 ? "bg-emerald-100 text-emerald-800" : e.pct >= 45 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}
              >
                Niv.{e.level ?? "?"} : {e.score}/{e.total} ({e.pct}%)
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pouls */}
      {s.pouls.some((p) => p.answered_at) ? (
        <div className="border-t border-line pt-2">
          <div className="text-[11px] font-bold text-ink-2 mb-1">Prises de pouls</div>
          <div className="space-y-1">
            {s.pouls.filter((p) => p.answered_at).map((p, i) => (
              <div key={i} className="text-[12px] text-ink-2">
                {["😞", "😕", "😐", "🙂", "😄"][(p.feeling ?? 3) - 1] ?? "•"} {fmt(p.answered_at)}
                {p.note ? <span className="text-ink-3"> — « {p.note} »</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Bilan de sortie */}
      {s.exit?.submitted_at ? (
        <div className="border-t border-line pt-2">
          <div className="text-[11px] font-bold text-ink-2 mb-1">Bilan de sortie ({fmt(s.exit.submitted_at)})</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
            <div className="flex justify-between"><span>Formation</span>{ratingStars(s.exit.rating_training)}</div>
            <div className="flex justify-between"><span>Collègues</span>{ratingStars(s.exit.rating_colleagues)}</div>
            <div className="flex justify-between"><span>Travail</span>{ratingStars(s.exit.rating_work)}</div>
            <div className="flex justify-between"><span>Salaire</span>{ratingStars(s.exit.rating_salary)}</div>
            <div className="flex justify-between"><span>Horaires</span>{ratingStars(s.exit.rating_schedule)}</div>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${s.exit.available_again ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
              Dispo future : {s.exit.available_again === true ? "oui" : s.exit.available_again === false ? "non" : "?"}
            </span>
            <span className={`rounded-full px-2 py-0.5 ${s.exit.wants_candidate ? "bg-emerald-100 text-emerald-800" : "bg-ink/10 text-ink-2"}`}>
              Redevenir candidat : {s.exit.wants_candidate === true ? "oui ✅" : s.exit.wants_candidate === false ? "non" : "?"}
            </span>
          </div>
          {s.exit.free_text ? <p className="mt-1.5 text-[12px] text-ink-3 italic">« {s.exit.free_text} »</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
