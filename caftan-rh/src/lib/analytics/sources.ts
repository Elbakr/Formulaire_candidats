// Pure functions to analyse candidate sources.
//
// Sources observed in the codebase : "manuel" (created by RH), "gravity_forms"
// (the WP form import) and the public form (no explicit source — null/empty).
// We bucket null/empty under "Formulaire public".

export type CandidateRow = {
  id: string;
  source: string | null;
  created_at: string;
};

export type ApplicationRow = {
  id: string;
  candidate_id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export type SourceMetrics = {
  source: string;
  label: string;
  total_candidates: number;
  applications: number;
  hires: number;
  hire_rate_pct: number;
  /** average days from candidate.created_at to hire (only over hired). */
  avg_time_to_hire_days: number | null;
};

const LABELS: Record<string, string> = {
  manuel: "Saisie manuelle",
  gravity_forms: "Gravity Forms (WP)",
  public_form: "Formulaire public",
  __unknown__: "Inconnu",
};

export function labelFor(source: string): string {
  return LABELS[source] ?? source;
}

function bucket(src: string | null | undefined): string {
  if (!src) return "public_form";
  return src;
}

export function computeSources(
  candidates: CandidateRow[],
  applications: ApplicationRow[],
): SourceMetrics[] {
  const byCand = new Map<string, CandidateRow>();
  for (const c of candidates) byCand.set(c.id, c);

  const groups = new Map<string, {
    cands: Set<string>;
    apps: number;
    hires: number;
    ttHireMs: number[];
  }>();

  // First, ensure every source is represented (even if 0 apps)
  for (const c of candidates) {
    const k = bucket(c.source);
    if (!groups.has(k)) {
      groups.set(k, { cands: new Set(), apps: 0, hires: 0, ttHireMs: [] });
    }
    groups.get(k)!.cands.add(c.id);
  }

  for (const a of applications) {
    const c = byCand.get(a.candidate_id);
    if (!c) continue;
    const k = bucket(c.source);
    const g = groups.get(k);
    if (!g) continue;
    g.apps += 1;
    if (a.status === "hired") {
      g.hires += 1;
      // Use updated_at as proxy for hire date.
      const refTo = a.updated_at ?? a.created_at;
      const tt = new Date(refTo).getTime() - new Date(c.created_at).getTime();
      if (Number.isFinite(tt) && tt >= 0) g.ttHireMs.push(tt);
    }
  }

  const out: SourceMetrics[] = [];
  for (const [k, g] of groups.entries()) {
    const total = g.cands.size;
    const hireRate = total === 0 ? 0 : (g.hires / total) * 100;
    const avgMs = g.ttHireMs.length === 0
      ? null
      : g.ttHireMs.reduce((a, b) => a + b, 0) / g.ttHireMs.length;
    out.push({
      source: k,
      label: labelFor(k),
      total_candidates: total,
      applications: g.apps,
      hires: g.hires,
      hire_rate_pct: hireRate,
      avg_time_to_hire_days: avgMs == null ? null : avgMs / 86_400_000,
    });
  }

  // Order : largest count first
  out.sort((a, b) => b.total_candidates - a.total_candidates);
  return out;
}

export function topPerformingSource(metrics: SourceMetrics[]): SourceMetrics | null {
  // Top = best hire rate, with at least 1 hire and at least 3 candidates to avoid noise.
  const eligible = metrics.filter((m) => m.hires > 0 && m.total_candidates >= 3);
  if (eligible.length === 0) return null;
  return eligible.slice().sort((a, b) => b.hire_rate_pct - a.hire_rate_pct)[0];
}
