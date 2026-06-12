// Karim 2026-06-10 (perf mobile A2) : skeleton instantane pendant que les
// widgets du dashboard mobile chargent (AVANT : ecran blanc 3-6s).
export default function Loading() {
  return (
    <div style={{ colorScheme: "light" }} className="min-h-screen bg-canvas space-y-3 p-4 animate-pulse" aria-hidden="true">
      {/* barre filtres periode/site */}
      <div className="flex gap-2">
        <div className="h-7 w-16 rounded-full bg-surface-2" />
        <div className="h-7 w-16 rounded-full bg-surface-2" />
        <div className="h-7 w-16 rounded-full bg-surface-2" />
      </div>
      {/* cartes widgets */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl bg-surface-2/60 p-4 space-y-3">
          <div className="h-4 w-1/3 rounded bg-surface-2" />
          <div className="h-8 w-1/2 rounded bg-surface-2" />
          <div className="h-3 w-2/3 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
