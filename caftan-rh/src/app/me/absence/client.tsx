"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { reportAbsenceAction } from "./actions";
import { formatDate } from "@/lib/utils";
import { toISODate } from "@/lib/planning";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

type Absence = {
  id: string;
  date: string;
  reason: string;
  status: string;
  replacement_employee_id: string | null;
  justification_url: string | null;
  notes: string | null;
  reported_at: string;
  resolved_at: string | null;
  shift:
    | {
        date: string;
        start_time: string;
        end_time: string;
        site: { code: string; name: string } | null;
      }
    | null;
};

const REASON_KEYS: Array<[string, TranslationKey]> = [
  ["sick", "absence.reason.sick"],
  ["family_emergency", "absence.reason.family_emergency"],
  ["transport", "absence.reason.transport"],
  ["other", "absence.reason.other"],
];

const STATUS_KEYS: Record<string, TranslationKey> = {
  reported: "absence.status.reported",
  covered: "absence.status.covered",
  unfilled: "absence.status.unfilled",
  resolved: "absence.status.resolved",
};

const STATUS_STYLES: Record<string, string> = {
  reported: "bg-warn-light text-warn",
  covered: "bg-success-light text-success",
  unfilled: "bg-danger-light text-danger",
  resolved: "bg-info-light text-info",
};

export function AbsenceClient({
  absences,
  locale = "fr",
}: {
  employeeId: string;
  absences: Absence[];
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(toISODate(new Date()));
  const [reason, setReason] = useState("sick");
  const [justificationUrl, setJustificationUrl] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setDate(toISODate(new Date()));
    setReason("sick");
    setJustificationUrl("");
    setNotes("");
  }

  function reasonLabel(code: string): string {
    const k = REASON_KEYS.find(([c]) => c === code);
    return k ? t(k[1], locale) : code;
  }

  function statusLabel(code: string): string {
    const k = STATUS_KEYS[code];
    return k ? t(k, locale) : code;
  }

  function submit() {
    startTransition(async () => {
      const r = await reportAbsenceAction({
        date,
        reason,
        justificationUrl: justificationUrl || undefined,
        notes: notes || undefined,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("absence.sent_msg", locale));
        setOpen(false);
        reset();
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="border-danger text-danger hover:bg-danger-light"
          onClick={() => setOpen(true)}
        >
          <AlertCircle className="h-4 w-4" /> {t("absence.report_btn", locale)}
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("absence.my_reports", locale)}</h2>
        </div>
        {absences.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            {t("absence.empty", locale)}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {absences.map((a) => (
              <div key={a.id} className="p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[a.status] ?? "bg-surface-2 text-ink-3"}`}
                  >
                    {statusLabel(a.status)}
                  </span>
                  <span className="text-sm font-bold">{formatDate(a.date)}</span>
                  <span className="text-xs text-ink-3">
                    · {reasonLabel(a.reason)}
                  </span>
                </div>
                {a.shift ? (
                  <div className="text-xs text-ink-3">
                    {t("absence.shift_planned", locale)}{" "}
                    {a.shift.start_time.slice(0, 5)}–{a.shift.end_time.slice(0, 5)}
                    {a.shift.site ? ` · ${t("common.site", locale)} ${a.shift.site.code}` : ""}
                  </div>
                ) : null}
                {a.notes ? (
                  <div className="text-xs text-ink-3 italic">&quot;{a.notes}&quot;</div>
                ) : null}
                {a.justification_url ? (
                  <a
                    href={a.justification_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-info underline"
                  >
                    {t("absence.justification_attached", locale)}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("absence.title_short", locale)}</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <div>
              <Label htmlFor="abs_date">{t("absence.date_label", locale)}</Label>
              <Input
                id="abs_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("absence.reason_label", locale)}</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_KEYS.map(([code, k]) => (
                    <SelectItem key={code} value={code}>
                      {t(k, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="abs_justif">{t("absence.justification_url", locale)}</Label>
              <Input
                id="abs_justif"
                type="url"
                placeholder="https://…"
                value={justificationUrl}
                onChange={(e) => setJustificationUrl(e.target.value)}
              />
              <p className="text-[11px] text-ink-3 mt-1">
                {t("absence.justification_hint", locale)}
              </p>
            </div>
            <div>
              <Label htmlFor="abs_notes">{t("common.notes", locale)}</Label>
              <Textarea
                id="abs_notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("absence.notes_placeholder", locale)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel", locale)}
            </Button>
            <Button variant="gold" onClick={submit} disabled={pending}>
              <Send className="h-4 w-4" /> {pending ? t("common.sending", locale) : t("absence.report_btn", locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
