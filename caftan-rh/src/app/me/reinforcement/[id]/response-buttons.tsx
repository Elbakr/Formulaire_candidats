"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptReinforcementAction,
  declineReinforcementAction,
} from "@/app/planning/reinforcement/actions";
import { t, type Locale } from "@/lib/i18n";

export function ReinforcementResponseButtons({
  requestId,
  locale = "fr",
}: {
  requestId: string;
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const r = await acceptReinforcementAction(requestId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(t("reinforcement.accepted_msg", locale));
      router.refresh();
    });
  }

  function decline() {
    startTransition(async () => {
      const r = await declineReinforcementAction(requestId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast(t("reinforcement.declined_msg", locale));
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
        <Check className="h-5 w-5" /> {t("reinforcement.accept", locale)}
      </Button>
      <Button
        size="lg"
        variant="danger"
        disabled={pending}
        onClick={decline}
        className="min-h-[56px] text-base"
      >
        <X className="h-5 w-5" /> {t("reinforcement.decline", locale)}
      </Button>
    </div>
  );
}
