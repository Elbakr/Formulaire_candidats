"use client";

// Karim 2026-07-03 : re-matche les fiches de paie orphelines vers les employés
// (actifs + archivés). Utile pour les ex-employés dont les dernières fiches
// n'avaient pas matché à l'import.

import { useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { rematchOrphanPayslipsAction } from "./actions";

export function RematchOrphansButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const r = await rematchOrphanPayslipsAction();
          if (!r.ok) {
            toast.error(r.error ?? "Échec du re-matching");
            return;
          }
          if ((r.rematched ?? 0) > 0) {
            toast.success(
              `${r.rematched} fiche(s) rattachée(s)${r.conflicts ? `, ${r.conflicts} conflit(s)` : ""}. ${r.still_orphan ?? 0} encore orpheline(s).`,
              { duration: 6000 },
            );
          } else {
            toast.info(`Aucune nouvelle association. ${r.still_orphan ?? 0} orpheline(s) restante(s).`);
          }
        });
      }}
      title="Rattache les fiches orphelines aux employés (actifs + archivés) par nom"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
      Re-matcher les orphelines
    </Button>
  );
}
