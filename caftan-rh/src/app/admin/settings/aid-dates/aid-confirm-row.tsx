"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { shiftAidByDaysAction, confirmAidDateAction } from "./actions";

export function AidConfirmRow({
  kind,
  hijriYear,
  jMinus1Date,
  jDate,
  jPlus1Date,
  jLabel,
  jNotes,
  staffMultiplier,
  todayISO,
}: {
  kind: "fitr" | "adha";
  hijriYear: number;
  jMinus1Date: string | null;
  jDate: string;
  jPlus1Date: string | null;
  jLabel: string;
  jNotes: string | null;
  staffMultiplier: number | null;
  todayISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localJ, setLocalJ] = useState(jDate);
  const [localJm1, setLocalJm1] = useState(jMinus1Date);
  const [localJp1, setLocalJp1] = useState(jPlus1Date);

  const daysUntil = (() => {
    const today = new Date(todayISO + "T12:00:00");
    const target = new Date(localJ + "T12:00:00");
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  })();

  const isConfirmed = (jNotes ?? "").toLowerCase().startsWith("confirme");
  const isUrgent = daysUntil >= 0 && daysUntil <= 7 && !isConfirmed;
  const isImminent = daysUntil >= 0 && daysUntil <= 3 && !isConfirmed;

  const tone = isImminent
    ? "border-l-4 border-l-danger bg-danger-light/30"
    : isUrgent
      ? "border-l-4 border-l-warn bg-warn-light/30"
      : isConfirmed
        ? "border-l-4 border-l-success bg-success-light/30"
        : "";

  const fmt = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-BE", {
      timeZone: "Europe/Brussels",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  function shift(delta: number) {
    startTransition(async () => {
      const r = await shiftAidByDaysAction({ kind, hijriYear, delta });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Date décalée");
      // Met a jour localement (les server actions revalidate la page)
      const apply = (d: string | null) => {
        if (!d) return d;
        const dt = new Date(d + "T12:00:00");
        dt.setDate(dt.getDate() + delta);
        return dt.toISOString().slice(0, 10);
      };
      setLocalJ((p) => apply(p) ?? p);
      setLocalJm1((p) => apply(p));
      setLocalJp1((p) => apply(p));
      router.refresh();
    });
  }

  function confirmNow() {
    startTransition(async () => {
      const r = await confirmAidDateAction({ kind, hijriYear });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Date confirmée. Plus de rappels.");
      router.refresh();
    });
  }

  const aidName =
    kind === "fitr" ? "🌙 Aïd al-Fitr (Aïd El Saghir)" : "🐑 Aïd al-Adha (Aïd El Kabir)";

  return (
    <Card className={tone}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-3 font-bold">
              Hijri {hijriYear}
            </div>
            <div className="font-bold text-lg">{aidName}</div>
            <div className="text-sm text-ink-2 mt-0.5">
              Date prévue du J : <strong>{fmt(localJ)}</strong>
              {daysUntil >= 0 ? (
                <span className="text-ink-3"> (dans {daysUntil} jour{daysUntil > 1 ? "s" : ""})</span>
              ) : (
                <span className="text-ink-3"> (passé)</span>
              )}
            </div>
          </div>
          <div className="text-right">
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success-light px-2 py-1 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirmée
              </span>
            ) : isImminent ? (
              <span className="text-xs font-bold text-danger bg-danger-light px-2 py-1 rounded">
                URGENT — vérifie l'annonce
              </span>
            ) : isUrgent ? (
              <span className="text-xs font-bold text-warn bg-warn-light px-2 py-1 rounded">
                À confirmer cette semaine
              </span>
            ) : (
              <span className="text-xs font-bold text-ink-3 bg-surface-2 px-2 py-1 rounded">
                Provisoire
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-line p-2 bg-surface">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
              J-1 (rush × 2)
            </div>
            <div className="font-mono">{localJm1 ? fmt(localJm1) : "—"}</div>
          </div>
          <div className="rounded border border-gold p-2 bg-gold-light">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gold-dark">
              J (magasins fermés)
            </div>
            <div className="font-mono font-bold">{fmt(localJ)}</div>
          </div>
          <div className="rounded border border-line p-2 bg-surface">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
              J+1 (post-Aïd × {staffMultiplier ?? 1})
            </div>
            <div className="font-mono">{localJp1 ? fmt(localJp1) : "—"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-line">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => shift(-1)}
            disabled={pending}
            title="Décale les 3 dates d'un jour en arrière"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            Reculer d'1 jour
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={confirmNow}
            disabled={pending}
            className="bg-success hover:bg-success/90 text-white"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Confirmer cette date
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => shift(1)}
            disabled={pending}
            title="Décale les 3 dates d'un jour en avant"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Avancer d'1 jour
          </Button>
          <span className="text-[10px] text-ink-3 ml-auto">
            {jLabel} · ID {hijriYear}
            {isConfirmed ? ` · ${jNotes}` : ""}
          </span>
        </div>
      </div>
    </Card>
  );
}
