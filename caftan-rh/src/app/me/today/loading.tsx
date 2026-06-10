// Karim 2026-06-10 (perf mobile A2) : skeleton instantane du tableau de bord
// employe (AVANT : ecran blanc 3-8s le temps des 14 requetes).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 animate-pulse" aria-hidden="true">
      <div className="h-7 w-1/2 rounded bg-surface-2" />
      {/* bandeau stats */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-surface-2/60 p-3 space-y-2">
            <div className="h-6 w-3/4 rounded bg-surface-2" />
            <div className="h-3 w-full rounded bg-surface-2" />
          </div>
        ))}
      </div>
      {/* cartes */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-surface-2/60 p-4 space-y-2">
          <div className="h-4 w-1/3 rounded bg-surface-2" />
          <div className="h-3 w-2/3 rounded bg-surface-2" />
          <div className="h-3 w-1/2 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
