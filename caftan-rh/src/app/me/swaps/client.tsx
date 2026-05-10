"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, X, Send, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  requestSwapAction,
  acceptSwapAction,
  rejectSwapAction,
  cancelSwapAction,
} from "./actions";
import { formatDate } from "@/lib/utils";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

type Site = { code: string; name: string; color: string | null } | null;

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  site?: Site;
};

type ColleagueShift = Shift & {
  employee_id: string;
  employee: { id: string; full_name: string } | null;
};

type Swap = {
  id: string;
  requester_employee_id: string;
  requester_shift_id: string;
  target_employee_id: string | null;
  target_shift_id: string | null;
  status: string;
  reason: string | null;
  auto_validated: boolean | null;
  needs_manager_review: boolean | null;
  manager_review_reason: string | null;
  created_at: string;
  decided_at: string | null;
};

type ShiftCtx = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  employee: { id: string; full_name: string } | null;
};

const STATUS_KEY: Record<string, TranslationKey> = {
  pending: "swap.status.pending",
  accepted: "swap.status.accepted",
  rejected: "swap.status.rejected",
  auto_validated: "swap.status.auto_validated",
  manager_approved: "swap.status.manager_approved",
  manager_rejected: "swap.status.manager_rejected",
  cancelled: "swap.status.cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warn-light text-warn",
  accepted: "bg-info-light text-info",
  rejected: "bg-danger-light text-danger",
  auto_validated: "bg-success-light text-success",
  manager_approved: "bg-success-light text-success",
  manager_rejected: "bg-danger-light text-danger",
  cancelled: "bg-surface-2 text-ink-3",
};

export function SwapsClient({
  myShifts,
  colleaguesShifts,
  colleagues,
  received,
  mine,
  shiftsCtx,
  locale = "fr",
}: {
  myEmployeeId: string;
  myShifts: Shift[];
  colleaguesShifts: ColleagueShift[];
  colleagues: Array<{ id: string; full_name: string }>;
  received: Swap[];
  mine: Swap[];
  shiftsCtx: ShiftCtx[];
  locale?: Locale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openDialog, setOpenDialog] = useState<{
    shift: Shift;
  } | null>(null);

  const [mode, setMode] = useState<"swap" | "coverage">("coverage");
  const [targetEmpId, setTargetEmpId] = useState<string>("");
  const [targetShiftId, setTargetShiftId] = useState<string>("");
  const [reason, setReason] = useState("");

  const colleagueShiftsByEmp = useMemo(() => {
    const m = new Map<string, ColleagueShift[]>();
    for (const s of colleaguesShifts) {
      const arr = m.get(s.employee_id) ?? [];
      arr.push(s);
      m.set(s.employee_id, arr);
    }
    return m;
  }, [colleaguesShifts]);

  const ctxById = useMemo(() => {
    const m = new Map<string, ShiftCtx>();
    for (const s of shiftsCtx) m.set(s.id, s);
    return m;
  }, [shiftsCtx]);

  function openFor(s: Shift) {
    setOpenDialog({ shift: s });
    setMode("coverage");
    setTargetEmpId("");
    setTargetShiftId("");
    setReason("");
  }

  function close() {
    setOpenDialog(null);
  }

  function submit() {
    if (!openDialog) return;
    if (mode === "swap" && !targetShiftId) {
      toast.error(t("swap.must_pick_target", locale));
      return;
    }
    if (mode === "swap" && !targetEmpId) {
      toast.error(t("swap.must_pick_colleague", locale));
      return;
    }
    startTransition(async () => {
      const r = await requestSwapAction({
        requesterShiftId: openDialog.shift.id,
        targetEmployeeId: targetEmpId || undefined,
        targetShiftId: mode === "swap" ? targetShiftId || undefined : undefined,
        reason: reason.trim() || undefined,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(
          mode === "coverage"
            ? t("swap.coverage_sent", locale)
            : t("swap.swap_sent", locale),
        );
        close();
        router.refresh();
      }
    });
  }

  function accept(id: string) {
    startTransition(async () => {
      const r = await acceptSwapAction(id);
      if (r.error) toast.error(r.error);
      else if (r.autoValidated) {
        toast.success(t("swap.auto_validated_msg", locale));
        router.refresh();
      } else if (r.needsManagerReview) {
        toast.message(
          t("swap.needs_review_msg", locale, {
            reasons: (r.reasons ?? []).join(", ") || t("swap.needs_review_default_reason", locale),
          }),
          { duration: 6000 },
        );
        router.refresh();
      }
    });
  }

  function reject(id: string) {
    if (!confirm(t("swap.confirm_reject", locale))) return;
    startTransition(async () => {
      const r = await rejectSwapAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("swap.rejected_msg", locale));
        router.refresh();
      }
    });
  }

  function cancelMine(id: string) {
    if (!confirm(t("swap.confirm_cancel", locale))) return;
    startTransition(async () => {
      const r = await cancelSwapAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(t("swap.cancelled_msg", locale));
        router.refresh();
      }
    });
  }

  function shiftLine(s: { date: string; start_time: string; end_time: string }) {
    return `${formatDate(s.date)} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
  }

  function statusLabel(code: string): string {
    const k = STATUS_KEY[code];
    return k ? t(k, locale) : code;
  }

  const targetCandidates = colleagueShiftsByEmp.get(targetEmpId) ?? [];

  return (
    <>
      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("swap.my_shifts", locale)}</h2>
        </div>
        {myShifts.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            {t("swap.my_shifts_empty", locale)}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {myShifts.map((s) => (
              <div key={s.id} className="p-3 flex items-center gap-3 flex-wrap">
                <Calendar className="h-4 w-4 text-ink-3 shrink-0" />
                <div className="flex-1 min-w-[200px] text-sm">
                  <div className="font-bold">{shiftLine(s)}</div>
                  <div className="text-xs text-ink-3">
                    {s.position ? `${s.position} · ` : ""}
                    {s.site?.code ? `${t("common.site", locale)} ${s.site.code}` : "—"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openFor(s)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" /> {t("swap.request_swap", locale)}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("swap.received", locale)}</h2>
        </div>
        {received.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">{t("swap.empty_received", locale)}</div>
        ) : (
          <div className="divide-y divide-line">
            {received.map((sw) => {
              const reqShift = ctxById.get(sw.requester_shift_id);
              const tShift = sw.target_shift_id ? ctxById.get(sw.target_shift_id) : null;
              return (
                <div key={sw.id} className="p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[sw.status] ?? "bg-surface-2 text-ink-3"}`}>
                      {statusLabel(sw.status)}
                    </span>
                    <span className="text-sm font-bold">
                      {t("swap.proposes_to_you", locale, { name: reqShift?.employee?.full_name ?? "—" })}
                    </span>
                  </div>
                  <div className="text-sm text-ink-2">
                    {t("swap.you_take", locale)}<strong>{reqShift ? shiftLine(reqShift) : "—"}</strong>
                  </div>
                  {tShift ? (
                    <div className="text-sm text-ink-2">
                      {t("swap.you_give", locale)}<strong>{shiftLine(tShift)}</strong>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-3 italic">{t("swap.coverage_only", locale)}</div>
                  )}
                  {sw.reason ? (
                    <div className="text-xs text-ink-3 italic">&quot;{sw.reason}&quot;</div>
                  ) : null}
                  {sw.status === "pending" ? (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="gold" onClick={() => accept(sw.id)} disabled={pending}>
                        <Check className="h-3.5 w-3.5" /> {t("swap.accept", locale)}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(sw.id)} disabled={pending}>
                        <X className="h-3.5 w-3.5" /> {t("swap.reject", locale)}
                      </Button>
                    </div>
                  ) : null}
                  {sw.status === "accepted" && sw.needs_manager_review ? (
                    <div className="text-[11px] text-info bg-info-light/40 rounded px-2 py-1 mt-1">
                      {t("swap.under_manager_review", locale, { reason: sw.manager_review_reason ?? "—" })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("swap.sent_by_me", locale)}</h2>
        </div>
        {mine.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">{t("swap.empty_sent", locale)}</div>
        ) : (
          <div className="divide-y divide-line">
            {mine.map((sw) => {
              const reqShift = ctxById.get(sw.requester_shift_id);
              const tShift = sw.target_shift_id ? ctxById.get(sw.target_shift_id) : null;
              return (
                <div key={sw.id} className="p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[sw.status] ?? "bg-surface-2 text-ink-3"}`}>
                      {statusLabel(sw.status)}
                    </span>
                    <span className="text-sm font-bold">
                      {t("swap.coverage_on", locale, {
                        kind: sw.target_shift_id ? t("swap.exchange_label", locale) : t("swap.coverage_label", locale),
                        shift: reqShift ? shiftLine(reqShift) : "—",
                      })}
                    </span>
                  </div>
                  {tShift ? (
                    <div className="text-sm text-ink-2">
                      {t("swap.against", locale)}<strong>{shiftLine(tShift)}</strong>{" "}
                      {t("swap.from_who", locale, { name: tShift.employee?.full_name ?? "—" })}
                    </div>
                  ) : null}
                  {sw.reason ? (
                    <div className="text-xs text-ink-3 italic">&quot;{sw.reason}&quot;</div>
                  ) : null}
                  {sw.status === "pending" || sw.status === "accepted" ? (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => cancelMine(sw.id)} disabled={pending}>
                        <X className="h-3.5 w-3.5" /> {t("common.cancel", locale)}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!openDialog} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("swap.dialog_title", locale)}</DialogTitle>
          </DialogHeader>
          {openDialog ? (
            <div className="p-5 space-y-4">
              <div className="text-sm bg-surface-2/50 rounded-md p-3">
                <div className="font-bold mb-1">{t("swap.my_shift", locale)}</div>
                <div>{shiftLine(openDialog.shift)}</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  {openDialog.shift.position ? `${openDialog.shift.position} · ` : ""}
                  {openDialog.shift.site?.code ? `${t("common.site", locale)} ${openDialog.shift.site.code}` : ""}
                </div>
              </div>

              <div>
                <Label>{t("swap.kind_label", locale)}</Label>
                <div className="grid sm:grid-cols-2 gap-2 mt-1">
                  <label
                    className={`flex items-center gap-2 rounded-md border-[1.5px] px-3 py-2 text-sm cursor-pointer ${
                      mode === "coverage"
                        ? "border-gold bg-gold-light text-gold-dark font-bold"
                        : "border-line hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      className="accent-gold"
                      checked={mode === "coverage"}
                      onChange={() => setMode("coverage")}
                    />
                    {t("swap.kind.coverage", locale)}
                  </label>
                  <label
                    className={`flex items-center gap-2 rounded-md border-[1.5px] px-3 py-2 text-sm cursor-pointer ${
                      mode === "swap"
                        ? "border-gold bg-gold-light text-gold-dark font-bold"
                        : "border-line hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      className="accent-gold"
                      checked={mode === "swap"}
                      onChange={() => setMode("swap")}
                    />
                    {t("swap.kind.swap", locale)}
                  </label>
                </div>
              </div>

              <div>
                <Label>{t("swap.colleague", locale)}</Label>
                <Select value={targetEmpId} onValueChange={setTargetEmpId}>
                  <SelectTrigger>
                    <SelectValue placeholder={mode === "coverage" ? t("swap.choose_colleague_optional", locale) : t("swap.choose_colleague", locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mode === "coverage" ? (
                  <p className="text-[11px] text-ink-3 mt-1">{t("swap.coverage_hint", locale)}</p>
                ) : null}
              </div>

              {mode === "swap" && targetEmpId ? (
                <div>
                  <Label>{t("swap.target_shift_label", locale)}</Label>
                  <Select value={targetShiftId} onValueChange={setTargetShiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("swap.choose_shift", locale)} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetCandidates.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {shiftLine(s)} · {s.position ?? "—"} · {t("common.site", locale)} {s.site?.code ?? "?"}
                        </SelectItem>
                      ))}
                      {targetCandidates.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          {t("swap.no_target_shifts", locale)}
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div>
                <Label htmlFor="swap_reason">{t("swap.reason_optional", locale)}</Label>
                <Textarea
                  id="swap_reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("swap.reason_placeholder", locale)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              {t("common.cancel", locale)}
            </Button>
            <Button variant="gold" onClick={submit} disabled={pending}>
              <Send className="h-4 w-4" /> {pending ? t("common.sending", locale) : t("common.send", locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
