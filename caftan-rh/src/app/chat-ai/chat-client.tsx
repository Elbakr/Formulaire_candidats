"use client";

// Karim 2026-06-06 : stub temporaire pour debloquer le build Vercel.
// Le chat-client.tsx original (Chat AI Anthropic Claude, feature PR #104)
// a ete perdu — jamais commit dans git, pas dans le zip backup. La page
// affiche un message bilingue en attendant la reconstruction propre
// (cf mail recap 2026-06-06).

export function ChatClient() {
  return (
    <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Chat AI — en reconstruction</h1>
      <p className="text-ink-3">
        Module temporairement indisponible, sera rétabli prochainement.
      </p>
      <p className="text-ink-3 text-sm italic">
        Module tijdelijk niet beschikbaar, wordt binnenkort hersteld.
      </p>
    </div>
  );
}
