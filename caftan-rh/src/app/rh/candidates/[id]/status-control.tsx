"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { PIPELINE_STAGES } from "@/lib/config";
import { updateApplicationStatusAction, updateApplicationRatingAction } from "../../actions";
import type { ApplicationStatus } from "@/types/database.types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function StatusControl({
  applicationId,
  currentStatus,
  currentRating,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
  currentRating: number;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ApplicationStatus>(currentStatus);
  const [rating, setRating] = useState(currentRating);

  function changeStatus(s: ApplicationStatus) {
    setStatus(s);
    startTransition(async () => {
      const res = await updateApplicationStatusAction(applicationId, s);
      if (res?.error) toast.error(res.error);
      else toast.success("Statut mis à jour.");
    });
  }

  function changeRating(r: number) {
    setRating(r);
    startTransition(async () => {
      const res = await updateApplicationRatingAction(applicationId, r);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <Card>
      <div className="p-4 flex items-center gap-4 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_STAGES.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={status === s.id ? "gold" : "outline"}
              onClick={() => changeStatus(s.id)}
              disabled={pending}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => changeRating(n)}
              disabled={pending}
              className="p-0.5"
              aria-label={`${n} étoiles`}
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  n <= rating ? "fill-gold text-gold" : "text-line",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
