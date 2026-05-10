"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn, formatDateTime } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { toggleOnboardingItemAction } from "@/app/onboarding/actions";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

type Run = {
  id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
};

type Item = {
  id: string;
  run_id: string;
  label: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  responsible_role: string;
  position: number;
  done_at: string | null;
};

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  admin: "onboarding.category.admin",
  tools: "onboarding.category.tools",
  training: "onboarding.category.training",
  legal: "onboarding.category.legal",
};
const ROLE_KEYS: Record<string, TranslationKey> = {
  rh: "onboarding.role.rh",
  manager: "onboarding.role.manager",
  employee: "onboarding.role.employee",
};

export function MyOnboardingPanel({
  run,
  items,
  locale,
}: {
  run: Run;
  items: Item[];
  locale: Locale;
}) {
  const router = useRouter();
  useRealtime("onboarding_run_items", () => router.refresh(), `run_id=eq.${run.id}`);
  useRealtime("onboarding_runs", () => router.refresh(), `id=eq.${run.id}`);

  const myItems = items.filter((i) => i.responsible_role === "employee");
  const otherItems = items.filter((i) => i.responsible_role !== "employee");

  const total = items.length;
  const done = items.filter((i) => i.done_at).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b border-line">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-ink-2 font-semibold">
              {t("onboarding.progress_global", locale, { done, total })}
            </span>
            <span
              className={cn(
                "font-mono font-extrabold",
                pct >= 100
                  ? "text-success"
                  : pct >= 50
                    ? "text-gold-dark"
                    : "text-warn",
              )}
            >
              {pct}%
            </span>
          </div>
          <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className={
                pct >= 100
                  ? "h-full bg-success"
                  : pct >= 50
                    ? "h-full bg-gold"
                    : "h-full bg-warn"
              }
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <div className="p-4">
          <h2 className="font-bold text-sm mb-2">
            {t("onboarding.my_tasks", locale, { n: myItems.length })}
          </h2>
          {myItems.length === 0 ? (
            <p className="text-xs text-ink-3">
              {t("onboarding.my_tasks_empty", locale)}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {myItems.map((it) => (
                <MyItemRow key={it.id} item={it} editable locale={locale} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {otherItems.length > 0 ? (
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-2">
            <Info className="h-4 w-4 text-ink-2" />
            <h2 className="font-bold text-sm">
              {t("onboarding.other_tasks", locale, { n: otherItems.length })}
            </h2>
          </div>
          <div className="p-4">
            <ul className="space-y-1.5">
              {otherItems.map((it) => (
                <MyItemRow
                  key={it.id}
                  item={it}
                  editable={false}
                  locale={locale}
                />
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MyItemRow({
  item,
  editable,
  locale,
}: {
  item: Item;
  editable: boolean;
  locale: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    if (!editable) return;
    startTransition(async () => {
      const r = await toggleOnboardingItemAction(item.id);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  const catKey = item.category ? CATEGORY_KEYS[item.category] : undefined;
  const roleKey = ROLE_KEYS[item.responsible_role];

  return (
    <li
      className={cn(
        "flex items-start gap-3 p-2.5 rounded-md border-2 transition-colors",
        item.done_at
          ? "border-success-light bg-success-light/30"
          : "border-line bg-surface",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending || !editable}
        className={cn(
          "mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
          item.done_at
            ? "bg-success border-success text-white"
            : editable
              ? "border-line bg-surface hover:border-success cursor-pointer"
              : "border-line bg-surface-2 cursor-not-allowed opacity-60",
        )}
        aria-label={
          item.done_at
            ? t("onboarding.mark_undone", locale)
            : t("onboarding.mark_done", locale)
        }
      >
        {item.done_at ? <Check className="h-3 w-3" /> : null}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-semibold",
              item.done_at && "line-through text-ink-3",
            )}
          >
            {item.label}
          </span>
          <Badge variant="muted" className="text-[9px]">
            {catKey ? t(catKey, locale) : (item.category ?? "")}
          </Badge>
          <Badge variant="muted" className="text-[9px]">
            {roleKey ? t(roleKey, locale) : item.responsible_role}
          </Badge>
        </div>
        {item.description ? (
          <p className="text-xs text-ink-3 mt-0.5">{item.description}</p>
        ) : null}
        {item.done_at ? (
          <p className="text-[11px] text-success font-semibold mt-1 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t("onboarding.done_at", locale, {
              date: formatDateTime(item.done_at),
            })}
          </p>
        ) : null}
      </div>
    </li>
  );
}
