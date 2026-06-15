"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { removeAvailabilitySlot } from "./actions";

export function RemoveButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await removeAvailabilitySlot(id);
      if (res.error) {
        // Affichage minimal inline — toast non disponible hors contexte Sonner
        alert(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Supprimer ce créneau"
      className="p-1.5 rounded text-ink-3 hover:text-danger hover:bg-danger-light disabled:opacity-40 transition-colors"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
