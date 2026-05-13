import { requireRole } from "@/lib/auth";
import { previewSitePlanAction } from "@/app/planning/sites/[code]/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DebugSolverPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["admin", "rh"]);
  const { week } = await props.searchParams;
  const today = new Date();
  const monday = new Date(today);
  const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  monday.setDate(today.getDate() + offset);
  const weekISO = week ?? monday.toISOString().slice(0, 10);
  const tomorrowISO = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("id, code")
    .eq("is_active", true)
    .order("code");

  // Appelle previewSitePlanAction pour chaque site, en isolant (pas de filtre cross-site)
  const results = await Promise.all(
    ((sites ?? []) as Array<{ id: string; code: string }>).map(async (s) => {
      try {
        const r = await previewSitePlanAction(s.code, weekISO);
        if ("error" in r) return { code: s.code, error: r.error };
        return {
          code: s.code,
          drafts: r.drafts.length,
          uncovered: r.uncovered.length,
          missing_total: r.uncovered.reduce((a, u) => a + u.missing, 0),
          sample_drafts: r.drafts.slice(0, 3).map((d) => ({
            date: d.date,
            time: `${d.start_time.slice(0, 5)}-${d.end_time.slice(0, 5)}`,
            emp: d.employee_name,
            tier: d.pool_tier,
            renfort: d.is_renfort,
          })),
          sample_uncovered: r.uncovered.slice(0, 3).map((u) => ({
            day: u.day_label,
            date: u.date,
            time: `${u.start_time.slice(0, 5)}-${u.end_time.slice(0, 5)}`,
            missing: u.missing,
            reason: u.reason,
          })),
        };
      } catch (e) {
        return { code: s.code, error: (e as Error).message };
      }
    }),
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Debug solver multi-sites</h1>
        <p className="text-sm text-ink-2">
          Semaine : <strong className="font-mono">{weekISO}</strong> ·
          Aujourd&apos;hui : <strong className="font-mono">{today.toISOString().slice(0, 10)}</strong> ·
          J+1 : <strong className="font-mono">{tomorrowISO}</strong>
        </p>
        <p className="text-xs text-ink-3 mt-1">
          Astuce : passe <code className="font-mono">?week=2026-05-18</code> pour tester la semaine prochaine.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {results.map((r) => (
          <div key={r.code} className="rounded border border-line p-3 text-xs">
            <div className="font-bold text-base mb-2">Site {r.code}</div>
            {"error" in r ? (
              <div className="text-danger font-mono">{r.error}</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <div className="text-[10px] uppercase text-ink-3">Drafts</div>
                    <div className={`font-mono font-bold text-lg ${r.drafts === 0 ? "text-danger" : "text-success"}`}>
                      {r.drafts}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-ink-3">Uncovered</div>
                    <div className="font-mono font-bold text-lg text-warn">{r.uncovered}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-ink-3">Missing</div>
                    <div className="font-mono font-bold text-lg">{r.missing_total}</div>
                  </div>
                </div>
                {r.sample_drafts.length > 0 ? (
                  <details className="mb-2">
                    <summary className="text-[10px] uppercase text-ink-3 cursor-pointer">Sample drafts</summary>
                    <pre className="text-[10px] mt-1 overflow-auto">{JSON.stringify(r.sample_drafts, null, 2)}</pre>
                  </details>
                ) : null}
                {r.sample_uncovered.length > 0 ? (
                  <details>
                    <summary className="text-[10px] uppercase text-warn cursor-pointer">Sample uncovered (raisons)</summary>
                    <pre className="text-[10px] mt-1 overflow-auto">{JSON.stringify(r.sample_uncovered, null, 2)}</pre>
                  </details>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
