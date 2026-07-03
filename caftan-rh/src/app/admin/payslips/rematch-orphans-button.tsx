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
          const repaired = r.repaired_secondaries ?? 0;
          const dup = r.duplicates_skipped ?? 0;
          const qr = r.qr_generated ?? 0;
          if ((r.rematched ?? 0) > 0 || repaired > 0 || qr > 0) {
            toast.success(
              `${r.rematched ?? 0} rattachée(s)` +
                (repaired ? `, ${repaired} avance(s) réparée(s)` : "") +
                (qr ? `, ${qr} QR (re)généré(s)` : "") +
                (dup ? `, ${dup} doublon(s) ignoré(s)` : "") +
                `. ${r.still_orphan ?? 0} encore orpheline(s).`,
              { duration: 7000 },
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
