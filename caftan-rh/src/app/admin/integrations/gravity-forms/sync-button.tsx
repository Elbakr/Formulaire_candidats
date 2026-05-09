"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runGfSyncAction } from "./actions";
import { toast } from "sonner";

export function GfSyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="gold"
      disabled={pending || disabled}
      onClick={() => {
        startTransition(async () => {
          const r = await runGfSyncAction();
          if (r?.error) toast.error(r.error);
          else if (r?.stats) {
            const s = r.stats;
            toast.success(
              `${s.created} nouveau(x), ${s.skipped_existing} déjà connu(s), ${s.skipped_invalid} invalide(s) sur ${s.fetched} entrées.`,
              { duration: 7000 },
            );
            if (s.errors.length > 0) toast.warning(s.errors.join("\n"));
            router.refresh();
          }
        });
      }}
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Synchronisation…" : "Importer maintenant"}
    </Button>
  );
}
