"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { triggerManualDigestAction } from "./actions";

export function ManualTriggerButtons() {
  const [pending, startTransition] = useTransition();

  function trigger(slot: "morning" | "evening") {
    startTransition(async () => {
      const r = await triggerManualDigestAction(slot);
      if (!r.ok) {
        toast.error(r.error || "Échec digest");
        return;
      }
      const aiNote = r.ai_used ? "IA OK" : `IA indisponible (${r.ai_error ?? "-"})`;
      toast.success(
        `Digest ${slot === "morning" ? "matin" : "soir"} lancé · ${aiNote}${r.email_sent ? " · email envoyé" : ""}`,
      );
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="gold" onClick={() => trigger("morning")} disabled={pending}>
        <Sparkles className="h-4 w-4" />
        {pending ? "..." : "Lancer digest matin"}
      </Button>
      <Button variant="outline" onClick={() => trigger("evening")} disabled={pending}>
        <Sparkles className="h-4 w-4" />
        {pending ? "..." : "Lancer digest soir"}
      </Button>
    </div>
  );
}
