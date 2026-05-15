"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resetAutoplanerRulesAction } from "./actions";

export function ResetButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Réinitialiser toutes les règles à leur valeur par défaut ?")) return;
        startTransition(async () => {
          const r = await resetAutoplanerRulesAction();
          if (r.error) toast.error(r.error);
          else {
            toast.success("Règles réinitialisées aux valeurs par défaut.");
            router.refresh();
          }
        });
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser aux défauts
    </Button>
  );
}
