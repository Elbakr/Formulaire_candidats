import { fetchPipelineCounts } from "@/lib/queries";
import { PIPELINE_STAGES } from "@/lib/config";
import { Card } from "@/components/ui/card";

export default async function RhReportsPage() {
  const counts = await fetchPipelineCounts();
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-sm text-ink-2">Vue d'ensemble du pipeline ({total} candidatures).</p>
      </div>

      <Card>
        <div className="p-4">
          <h2 className="font-bold mb-3">Répartition par statut</h2>
          <div className="space-y-2">
            {PIPELINE_STAGES.map((s) => {
              const v = counts[s.id] ?? 0;
              const pct = total ? (v / total) * 100 : 0;
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-ink-3 font-mono">{v} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
