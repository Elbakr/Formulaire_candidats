"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSequenceActiveAction } from "./actions";
import { toast } from "sonner";

export function SequenceToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={isActive ? "outline" : "gold"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleSequenceActiveAction(id);
          if (r?.error) toast.error(r.error);
          else {
            toast.success(r?.is_active ? "Activée." : "Désactivée.");
            router.refresh();
          }
        })
      }
    >
      <Power className="h-3.5 w-3.5" /> {isActive ? "Désactiver" : "Activer"}
    </Button>
  );
}
