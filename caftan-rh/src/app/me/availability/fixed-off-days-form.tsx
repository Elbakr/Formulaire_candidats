"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateMyFixedOffDaysAction } from "./actions";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

// Convention `employees.fixed_off_days` : 0=Lun..6=Dim (cf. solver site).
const DAY_KEYS: TranslationKey[] = [
  "weekday.short.0",
  "weekday.short.1",
  "weekday.short.2",
  "weekday.short.3",
  "weekday.short.4",
  "weekday.short.5",
  "weekday.short.6",
];

export function FixedOffDaysForm({
  initial,
  locale = "fr",
}: {
  initial: number[];
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState<number[]>(
    initial.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort(),
  );

  function toggle(i: number) {
    setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));
  }

  function save() {
    const fd = new FormData();
    fd.set("fixed_off_days", JSON.stringify(days));
    startTransition(async () => {
      const r = await updateMyFixedOffDaysAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("availability.fixed_saved", locale));
        router.refresh();
      }
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DAY_KEYS.map((k, i) => (
          <button
            key={k}
            type="button"
            onClick={() => toggle(i)}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 rounded-md border-2 text-xs font-bold transition disabled:opacity-50",
              days.includes(i)
                ? "bg-violet text-white border-violet"
                : "bg-surface border-line text-ink-3 hover:border-violet",
            )}
          >
            {t(k, locale)}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="gold" size="sm" onClick={save} disabled={pending}>
          {pending ? t("common.saving", locale) : t("common.save", locale)}
        </Button>
      </div>
    </div>
  );
}
