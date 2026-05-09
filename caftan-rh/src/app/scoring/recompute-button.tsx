"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recomputeMetricsAction } from "./actions";
import { toast } from "sonner";

export function RecomputeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await recomputeMetricsAction();
          if (r?.error) toast.error(r.error);
          else {
            toast.success(`${r?.count ?? 0} employés recalculés.`);
            router.refresh();
          }
        })
      }
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      Recalculer
    </Button>
  );
}
