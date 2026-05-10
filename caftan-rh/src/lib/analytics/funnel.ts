// Pure functions to compute the recruitment funnel.
//
// Inputs : raw rows from `applications` (status + created_at + updated_at)
//          plus interviews rows (scheduled_at, status) attached via application_id.
// Outputs : { received, contacted, rdv_scheduled, rdv_done, hired, refused }
//           and conversion rates between stages.
//
// We measure stage entry by current status "high water mark".
// Since the schema doesn't keep history, we count any application currently at
// or beyond a given stage. Order : new < contacted < rdv_scheduled < rdv_done
// < wait_decision < hired (refused excluded from the linear funnel).

export type AppStatusRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export type FunnelCounts = {
  received: number;
  contacted: number;
  rdv_scheduled: number;
  rdv_done: number;
  hired: number;
  refused: number;
};

const RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  rdv_scheduled: 2,
  rdv_done: 3,
  wait_decision: 4,
  hired: 5,
  refused: -1,
};

function rank(status: string): number {
  return RANK[status] ?? 0;
}

export function computeFunnel(rows: AppStatusRow[]): FunnelCounts {
  const out: FunnelCounts = {
    received: 0,
    contacted: 0,
    rdv_scheduled: 0,
    rdv_done: 0,
    hired: 0,
    refused: 0,
  };
  for (const r of rows) {
    out.received += 1;
    const rk = rank(r.status);
    if (r.status === "refused") {
      out.refused += 1;
      continue;
    }
    if (rk >= 1) out.contacted += 1;
    if (rk >= 2) out.rdv_scheduled += 1;
    if (rk >= 3) out.rdv_done += 1;
    if (rk >= 5) out.hired += 1;
  }
  return out;
}

export function filterByDateRange<T extends { created_at: string }>(
  rows: T[],
  startISO: string,
  endISO: string,
): T[] {
  // inclusive bounds (YYYY-MM-DD or full ISO)
  return rows.filter((r) => {
    const c = r.created_at;
    return c >= startISO && c <= endISO;
  });
}

export function pct(num: number, den: number): number {
  if (!den) return 0;
  return (num / den) * 100;
}

/** Stage-to-stage conversion in % (e.g. contacted/received). */
export function conversionRates(c: FunnelCounts) {
  return {
    contacted_of_received: pct(c.contacted, c.received),
    rdv_scheduled_of_contacted: pct(c.rdv_scheduled, c.contacted),
    rdv_done_of_rdv_scheduled: pct(c.rdv_done, c.rdv_scheduled),
    hired_of_rdv_done: pct(c.hired, c.rdv_done),
    hired_of_received: pct(c.hired, c.received),
  };
}

export type FunnelStage = {
  key: keyof FunnelCounts;
  label: string;
  count: number;
  /** % vs the stage above (only meaningful past "received") */
  conversionFromPrev: number;
  /** % vs total received */
  pctOfTotal: number;
};

const ORDER: Array<{ key: keyof FunnelCounts; label: string }> = [
  { key: "received", label: "Reçues" },
  { key: "contacted", label: "Contactés" },
  { key: "rdv_scheduled", label: "RDV planifiés" },
  { key: "rdv_done", label: "RDV faits" },
  { key: "hired", label: "Embauchés" },
];

export function buildStages(c: FunnelCounts): FunnelStage[] {
  const stages: FunnelStage[] = [];
  let prev = c.received;
  for (let i = 0; i < ORDER.length; i++) {
    const o = ORDER[i];
    const count = c[o.key];
    stages.push({
      key: o.key,
      label: o.label,
      count,
      conversionFromPrev: i === 0 ? 100 : pct(count, prev || 1),
      pctOfTotal: pct(count, c.received || 1),
    });
    prev = count;
  }
  return stages;
}

/** Difference (signed) between two funnel counts, in pp on hired_of_received. */
export function deltaConversion(curr: FunnelCounts, prev: FunnelCounts): number {
  const cr = conversionRates(curr).hired_of_received;
  const pr = conversionRates(prev).hired_of_received;
  return cr - pr;
}
