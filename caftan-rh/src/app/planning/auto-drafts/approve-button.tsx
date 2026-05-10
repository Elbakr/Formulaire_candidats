"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveAutoDraftAction, rejectAutoDraftAction } from "./actions";

export function ApproveButton({
  draftId,
  totalShifts,
}: {
  draftId: string;
  totalShifts: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const r = await approveAutoDraftAction(draftId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.created ?? 0} shifts créés.`);
      router.refresh();
    });
  }

  function reject() {
    if (!confirm("Rejeter ce draft ? Les shifts ne seront pas créés.")) return;
    startTransition(async () => {
      const r = await rejectAutoDraftAction(draftId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast("Draft rejeté.");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="gold"
        disabled={pending}
        onClick={approve}
        className="min-h-[40px]"
      >
        <CheckCircle2 className="h-4 w-4" />{" "}
        {pending ? "Création…" : `Valider et créer (${totalShifts})`}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={reject}
        className="min-h-[40px]"
      >
        <X className="h-4 w-4" /> Rejeter
      </Button>
    </>
  );
}
