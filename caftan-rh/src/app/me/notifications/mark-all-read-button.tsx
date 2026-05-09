"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";
import { toast } from "sonner";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await markAllReadAction();
          if (r?.error) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      {pending ? "…" : "Tout marquer lu"}
    </Button>
  );
}
