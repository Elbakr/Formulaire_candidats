"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Sparkles, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRealtime } from "@/hooks/use-realtime";
import { requestTimeOffAction, cancelTimeOffAction } from "@/app/planning/actions";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

const KIND_KEYS: Array<[string, TranslationKey]> = [
  ["vacation", "time_off.kind.vacation"],
  ["sick", "time_off.kind.sick"],
  ["personal", "time_off.kind.personal"],
  ["unpaid", "time_off.kind.unpaid"],
  ["other", "time_off.kind.other"],
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warn-light text-warn",
  approved: "bg-success-light text-success",
  rejected: "bg-danger-light text-danger",
  cancelled: "bg-surface-2 text-ink-3",
};

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "time_off.status.pending",
  approved: "time_off.status.approved",
  rejected: "time_off.status.rejected",
  cancelled: "time_off.status.cancelled",
};

const AUTO_REASON_KEYS: Record<string, TranslationKey> = {
  all_rules_passed: "time_off.reason.all_rules_passed",
  preavis_too_short: "time_off.reason.preavis_too_short",
  too_long: "time_off.reason.too_long",
  in_blocked_period: "time_off.reason.in_blocked_period",
  too_many_absents: "time_off.reason.too_many_absents",
  manual_override: "time_off.reason.manual_override",
};

type Req = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
  auto_validated: boolean | null;
  auto_validation_reason: string | null;
};

export function TimeOffMyPanel({
  employeeId,
  requests,
  locale = "fr",
}: {
  employeeId: string;
  requests: Req[];
  locale?: Locale;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState("vacation");

  useRealtime("time_off_requests", () => router.refresh(), `employee_id=eq.${employeeId}`);

  function kindLabel(code: string): string {
    const k = KIND_KEYS.find(([c]) => c === code);
    return k ? t(k[1], locale) : code;
  }

  function autoReasonLabel(code: string | null): string | null {
    if (!code) return null;
    const k = AUTO_REASON_KEYS[code];
    return k ? t(k, locale) : code;
  }

  function cancel(id: string) {
    if (!confirm(t("time_off.cancel_confirm", locale))) return;
    startTransition(async () => {
      const r = await cancelTimeOffAction(id);
      if (r?.error) toast.error(r.error);
      else toast.success(t("time_off.cancelled_msg", locale));
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <form
          ref={formRef}
          action={(fd) => {
            fd.set("kind", kind);
            startTransition(async () => {
              const r = await requestTimeOffAction(fd);
              if (r?.error) toast.error(r.error);
              else {
                if (r.auto_validated) {
                  toast.success(t("time_off.auto_validated_msg", locale), { duration: 5000 });
                } else if (r.recommendation === "escalate_to_manager") {
                  const why = autoReasonLabel(r.reason_code ?? null);
                  toast.message(
                    why
                      ? t("time_off.escalation_msg", locale, { reason: why })
                      : t("time_off.escalation_msg_no_reason", locale),
                    { duration: 6000 },
                  );
                } else {
                  toast.success(t("time_off.sent", locale));
                }
                formRef.current?.reset();
              }
            });
          }}
          className="p-4 grid md:grid-cols-2 gap-3 items-end"
        >
          <div>
            <Label>{t("time_off.kind_label", locale)}</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_KEYS.map(([code, k]) => (
                  <SelectItem key={code} value={code}>{t(k, locale)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1" />
          <div>
            <Label htmlFor="start_date">{t("time_off.start_date", locale)}</Label>
            <Input id="start_date" name="start_date" type="date" required />
          </div>
          <div>
            <Label htmlFor="end_date">{t("time_off.end_date", locale)}</Label>
            <Input id="end_date" name="end_date" type="date" required />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="reason">{t("time_off.reason", locale)}</Label>
            <Textarea id="reason" name="reason" rows={2} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="gold" disabled={pending}>
              <Plus className="h-4 w-4" /> {pending ? t("time_off.requesting", locale) : t("time_off.request", locale)}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("time_off.my_requests", locale)}</h2>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">{t("time_off.empty", locale)}</div>
        ) : (
          <div className="divide-y divide-line">
            {requests.map((r) => {
              const days = Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86_400_000) + 1;
              const escalationLabel =
                r.status === "pending" && r.auto_validation_reason
                  ? autoReasonLabel(r.auto_validation_reason)
                  : null;
              return (
                <div key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gold-light text-gold-dark">
                    {kindLabel(r.kind)}
                  </span>
                  <div className="flex-1 min-w-[200px] text-sm">
                    {t("time_off.range", locale, { start: formatDate(r.start_date), end: formatDate(r.end_date), days })}
                    {r.reason ? <div className="text-xs text-ink-3 italic mt-0.5">&quot;{r.reason}&quot;</div> : null}
                    {escalationLabel ? (
                      <div className="text-[11px] text-warn mt-1 inline-flex items-center gap-1">
                        <Info className="h-3 w-3" /> {t("time_off.escalation_label", locale)} : {escalationLabel}
                      </div>
                    ) : null}
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                    {t(STATUS_KEYS[r.status], locale)}
                  </span>
                  {r.status === "approved" && r.auto_validated ? (
                    <span
                      className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-success-light text-success inline-flex items-center gap-1"
                      title={t("time_off.auto_validated_title", locale)}
                    >
                      <Sparkles className="h-3 w-3" /> {t("time_off.auto_validated", locale)}
                    </span>
                  ) : null}
                  {r.status === "pending" ? (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} disabled={pending}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
