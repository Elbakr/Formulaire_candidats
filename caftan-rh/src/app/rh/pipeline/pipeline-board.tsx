"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/use-realtime";
import { PIPELINE_STAGES, type PipelineStageId } from "@/lib/config";
import { NameAvatar } from "@/components/ui/avatar";
import { updateApplicationStatusAction } from "../actions";
import type { ApplicationListItem } from "@/lib/queries";
import type { ApplicationStatus } from "@/types/database.types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PipelineBoard({ initialData }: { initialData: ApplicationListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, ApplicationStatus>>({});

  useRealtime("applications", () => router.refresh());

  const grouped = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.id, [] as ApplicationListItem[]]),
  ) as Record<PipelineStageId, ApplicationListItem[]>;

  for (const app of initialData) {
    const effective = optimistic[app.id] ?? app.status;
    if (grouped[effective as PipelineStageId]) {
      grouped[effective as PipelineStageId].push({ ...app, status: effective });
    }
  }

  function onDrop(applicationId: string, newStatus: PipelineStageId) {
    setDragOver(null);
    setOptimistic((o) => ({ ...o, [applicationId]: newStatus }));
    startTransition(async () => {
      const res = await updateApplicationStatusAction(applicationId, newStatus);
      if (res?.error) {
        toast.error(res.error);
        setOptimistic((o) => {
          const { [applicationId]: _, ...rest } = o;
          return rest;
        });
      } else {
        toast.success("Statut mis à jour.");
      }
    });
  }

  return (
    <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(220px, 1fr))` }}>
      {PIPELINE_STAGES.map((stage) => {
        const items = grouped[stage.id] ?? [];
        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              if (id) onDrop(id, stage.id);
            }}
            className={cn(
              "rounded-[var(--radius)] bg-surface border border-line p-2 min-h-[400px] flex flex-col gap-2",
              dragOver === stage.id && "border-gold ring-2 ring-gold-light",
              pending && "opacity-90",
            )}
          >
            <div className="flex items-center justify-between px-1 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{stage.label}</div>
              <div className="text-xs font-mono text-ink-3">{items.length}</div>
            </div>
            {items.map((app) => (
              <Link
                key={app.id}
                href={`/rh/candidates/${app.id}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", app.id)}
                className="block bg-surface border border-line rounded-md p-2.5 hover:border-gold transition-colors active:scale-95 cursor-grab"
              >
                <div className="flex items-start gap-2">
                  <NameAvatar name={app.candidate.full_name} className="h-7 w-7 text-[10px]" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs truncate">{app.candidate.full_name}</div>
                    <div className="text-[10px] text-ink-3 truncate">{app.job?.title ?? "Spontanée"}</div>
                  </div>
                </div>
              </Link>
            ))}
            {items.length === 0 ? (
              <div className="text-center text-[11px] text-ink-3 py-6">—</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
