"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { resolveComplianceEventAction } from "./guide-ack-actions";

export function ResolveComplianceButton({
  eventId,
  employeeId,
}: {
  eventId: string;
  employeeId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await resolveComplianceEventAction({ eventId, employeeId });
          if (res.ok) toast.success("Manquement résolu.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      Résoudre
    </Button>
  );
}
