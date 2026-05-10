"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { addMyUnavailabilityAction, deleteMyUnavailabilityAction } from "./actions";
import { formatDate } from "@/lib/utils";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

// 0=Dim..6=Sam (cohérent avec Date.getDay() et site_needs).
const DOW_KEYS: TranslationKey[] = [
  "weekday.long.sun",
  "weekday.long.mon",
  "weekday.long.tue",
  "weekday.long.wed",
  "weekday.long.thu",
  "weekday.long.fri",
  "weekday.long.sat",
];

const REASON_KEYS: Array<[string, TranslationKey]> = [
  ["cours", "availability.reason.cours"],
  ["examen", "availability.reason.examen"],
  ["medical", "availability.reason.medical"],
  ["perso", "availability.reason.perso"],
  ["autre", "availability.reason.autre"],
];

type Item = {
  id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
};

export function UnavailabilitiesPanel({
  mode,
  items,
  locale = "fr",
}: {
  mode: "recurring" | "specific";
  items: Item[];
  locale?: Locale;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("perso");
  const [dow, setDow] = useState<string>("1");

  function submit(fd: FormData) {
    fd.set("mode", mode);
    fd.set("reason", reason);
    if (mode === "recurring") fd.set("day_of_week", dow);
    startTransition(async () => {
      const r = await addMyUnavailabilityAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("availability.added", locale));
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm(t("availability.confirm_delete", locale))) return;
    startTransition(async () => {
      const r = await deleteMyUnavailabilityAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("availability.deleted", locale));
        router.refresh();
      }
    });
  }

  function reasonLabel(code: string | null): string {
    if (!code) return "—";
    const found = REASON_KEYS.find(([c]) => c === code);
    return found ? t(found[1], locale) : code;
  }

  const optSuffix = ` ${t("availability.optional_suffix", locale)}`;

  return (
    <div>
      {open ? (
        <form
          ref={formRef}
          action={submit}
          className="p-4 grid md:grid-cols-2 gap-3 items-end border-b border-line bg-surface-2/40"
        >
          {mode === "recurring" ? (
            <div>
              <Label htmlFor="day_of_week">{t("availability.day_label", locale)}</Label>
              <Select value={dow} onValueChange={setDow}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOW_KEYS.map((k, i) => (
                    <SelectItem key={i} value={String(i)}>{t(k, locale)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label htmlFor="date_specific">{t("availability.date_label", locale)}</Label>
              <Input id="date_specific" name="date_specific" type="date" required />
            </div>
          )}
          <div>
            <Label htmlFor="reason">{t("common.reason", locale)}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_KEYS.map(([code, k]) => (
                  <SelectItem key={code} value={code}>{t(k, locale)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="start_time">{t("availability.start_time", locale)}{mode === "specific" ? optSuffix : ""}</Label>
            <Input id="start_time" name="start_time" type="time" required={mode === "recurring"} />
          </div>
          <div>
            <Label htmlFor="end_time">{t("availability.end_time", locale)}{mode === "specific" ? optSuffix : ""}</Label>
            <Input id="end_time" name="end_time" type="time" required={mode === "recurring"} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">{t("common.notes", locale)} {t("availability.optional_suffix", locale)}</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder={t("availability.notes_hint", locale)} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel", locale)}
            </Button>
            <Button type="submit" variant="gold" size="sm" disabled={pending}>
              {pending ? t("common.saving", locale) : t("common.add", locale)}
            </Button>
          </div>
        </form>
      ) : (
        <div className="p-3 border-b border-line">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> {t("common.add", locale)}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-3">
          {mode === "recurring"
            ? t("availability.empty_recurring", locale)
            : t("availability.empty_specific", locale)}
        </div>
      ) : (
        <div className="divide-y divide-line">
          {items.map((u) => {
            const slotLabel =
              u.start_time && u.end_time
                ? `${u.start_time.slice(0, 5)} – ${u.end_time.slice(0, 5)}`
                : t("availability.full_day", locale);
            return (
              <div key={u.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-sm">
                    {mode === "recurring"
                      ? t(DOW_KEYS[u.day_of_week ?? 0], locale)
                      : u.date_specific
                        ? formatDate(u.date_specific)
                        : "—"}{" "}
                    · {slotLabel}
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    {t("common.reason", locale)} : <span className="font-semibold text-ink-2">{reasonLabel(u.reason)}</span>
                    {u.notes ? <span className="ml-2 italic">&quot;{u.notes}&quot;</span> : null}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(u.id)} disabled={pending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
