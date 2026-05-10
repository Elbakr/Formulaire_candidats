"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";
import { toast } from "sonner";
import { t, type Locale } from "@/lib/i18n";

export function MarkAllReadButton({ locale }: { locale: Locale }) {
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
      {pending
        ? t("common.loading", locale)
        : t("notifications.mark_all_short", locale)}
    </Button>
  );
}
