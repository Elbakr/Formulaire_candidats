"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  proposeInterviewSlotsAction,
  type ProposeSlotsResult,
} from "./scheduling-actions";

type Slot = {
  date: string;
  start_time: string;
  end_time: string;
  reasoning?: string;
};

export function ScheduleButton({ applicationId }: { applicationId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    slots: Slot[];
    summary: string;
    actionId: string;
  } | null>(null);

  function onClick() {
    startTransition(async () => {
      const r: ProposeSlotsResult = await proposeInterviewSlotsAction(applicationId);
      if (!r.ok) {
        toast.error(r.error || "AI indisponible");
        return;
      }
      setResult({ slots: r.slots, summary: r.summary, actionId: r.action_id });
      toast.success("3 créneaux proposés par l'IA.");
    });
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <Button variant="outline" onClick={onClick} disabled={pending}>
        <Sparkles className="h-4 w-4" />
        {pending ? "L'IA réfléchit..." : "Demander 3 créneaux à l'IA"}
      </Button>
      {result ? (
        <Card className="p-3 w-full max-w-md text-xs space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-gold-dark" />
            <strong>Créneaux proposés</strong>
          </div>
          <p className="text-ink-3">{result.summary}</p>
          <ul className="space-y-1.5">
            {result.slots.map((s, i) => (
              <li
                key={i}
                className="rounded-md border border-line bg-surface-2 p-2"
              >
                <div className="font-mono font-bold">
                  {s.date} · {s.start_time}–{s.end_time}
                </div>
                {s.reasoning ? (
                  <div className="text-[11px] text-ink-3 mt-0.5">{s.reasoning}</div>
                ) : null}
              </li>
            ))}
          </ul>
          <a
            href={`/rh/inbox/${result.actionId}`}
            className="text-gold-dark hover:underline text-[11px] inline-block"
          >
            Voir dans l&apos;Inbox →
          </a>
        </Card>
      ) : null}
    </div>
  );
}
