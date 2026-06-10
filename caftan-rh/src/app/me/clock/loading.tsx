// Karim 2026-06-10 (perf mobile A2) : skeleton instantane de la page pointage
// (AVANT : ecran blanc le temps des 6 requetes + waterfall sites).
export default function Loading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4 animate-pulse" aria-hidden="true">
      {/* gros bouton pointage */}
      <div className="aspect-square w-full max-w-[240px] mx-auto rounded-full bg-surface-2" />
      {/* shifts du jour */}
      <div className="rounded-2xl bg-surface-2/60 p-4 space-y-2">
        <div className="h-4 w-1/3 rounded bg-surface-2" />
        <div className="h-3 w-2/3 rounded bg-surface-2" />
      </div>
      {/* historique */}
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}
