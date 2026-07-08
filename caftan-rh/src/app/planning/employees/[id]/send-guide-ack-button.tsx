"use client";

import { useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendGuideAckAction } from "./guide-ack-actions";

export function SendGuideAckButton({ employeeId }: { employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await sendGuideAckAction({ employeeId });
          if (res.ok) toast.success("Guide conduite envoyé au travailleur (à confirmer).");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      Envoyer le guide à confirmer
    </Button>
  );
}
