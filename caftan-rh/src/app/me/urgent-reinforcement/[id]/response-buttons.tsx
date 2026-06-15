"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptUrgentReinforcementAction,
  declineUrgentReinforcementAction,
} from "./actions";

export function UrgentReinforcementButtons({ reinforcementId }: { reinforcementId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const r = await acceptUrgentReinforcementAction(reinforcementId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Renfort accepté, shift créé. Merci !");
      router.refresh();
    });
  }

  function decline() {
    startTransition(async () => {
      const r = await declineUrgentReinforcementAction(reinforcementId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast("Refus enregistré, on propose à quelqu'un d'autre.");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <Button
        size="lg"
        variant="success"
        disabled={pending}
        onClick={accept}
        className="min-h-[56px] text-base"
      >
        <Check className="h-5 w-5" /> J'accepte
      </Button>
      <Button
        size="lg"
        variant="danger"
        disabled={pending}
        onClick={decline}
        className="min-h-[56px] text-base"
      >
        <X className="h-5 w-5" /> Je ne peux pas
      </Button>
    </div>
  );
}
