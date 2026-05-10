"use client";

import { useEffect, useState } from "react";

/**
 * Affiche la durée écoulée depuis `since` (ISO timestamp).
 * Re-render chaque minute.
 */
export function LiveDuration({ since, className }: { since: string; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, Date.now() - new Date(since).getTime());
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return (
    <span className={className}>
      {h === 0 ? `${m} min` : `${h}h${m.toString().padStart(2, "0")}`}
    </span>
  );
}
