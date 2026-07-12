"use client";

import { useTransition } from "react";
import { Loader2, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendGuideAckAction } from "./guide-ack-actions";

// Karim 2026-07-12 : c'est LE « grand manuel » (guide de conduite / règles en
// magasin) à envoyer au travailleur pour lecture + confirmation. Libellé explicite
// (« grand manuel ») + style visible pour qu'on le retrouve tout de suite.
export function SendGuideAckButton({ employeeId }: { employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="gold"
      size="sm"
      disabled={pending}
      title="Envoyer au travailleur le grand manuel (guide de conduite) à lire et confirmer (lu / compris / assimilé / accepté)"
      onClick={() =>
        start(async () => {
          const res = await sendGuideAckAction({ employeeId });
          if (res.ok) toast.success("Grand manuel (guide de conduite) envoyé au travailleur, à confirmer.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpenCheck className="h-3.5 w-3.5" />}
      Envoyer le grand manuel
    </Button>
  );
}
