"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NameAvatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { upsertWeeklyRatingAction } from "./actions";

const RATING_BG: Record<number, string> = {
  1: "bg-danger text-white",
  2: "bg-danger-light text-danger",
  3: "bg-warn-light text-warn",
  4: "bg-success-light text-success",
  5: "bg-success text-white",
};
const RATING_BG_DOT: Record<number, string> = {
  0: "bg-line",
  1: "bg-danger",
  2: "bg-danger-light",
  3: "bg-warn",
  4: "bg-success-light",
  5: "bg-success",
};

export type RatingCardProps = {
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  siteCode: string | null;
  weekMonday: string;
  currentRating: number | null;
  currentComment: string | null;
  history: Array<{ week_monday: string; rating: number }>;
};

export function RatingCard(props: RatingCardProps) {
  const [rating, setRating] = useState<number | null>(props.currentRating);
  const [comment, setComment] = useState<string>(props.currentComment ?? "");
  const [pending, startTransition] = useTransition();

  function submit(newRating: number) {
    setRating(newRating);
    startTransition(async () => {
      const r = await upsertWeeklyRatingAction({
        employeeId: props.employeeId,
        weekMonday: props.weekMonday,
        rating: newRating,
        comment,
      });
      if (r?.error) toast.error(r.error);
      else toast.success(`Note ${newRating}/5 enregistrée.`);
    });
  }

  function saveComment() {
    if (rating == null) return;
    startTransition(async () => {
      const r = await upsertWeeklyRatingAction({
        employeeId: props.employeeId,
        weekMonday: props.weekMonday,
        rating,
        comment,
      });
      if (r?.error) toast.error(r.error);
      else toast.success("Commentaire enregistré.");
    });
  }

  return (
    <div className="p-4 border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 mb-3">
        <NameAvatar name={props.fullName} className="h-9 w-9 text-sm rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{props.fullName}</div>
          <div className="text-[11px] text-ink-3 truncate">
            {props.jobTitle ?? "—"}
            {props.siteCode ? <> · site {props.siteCode}</> : null}
          </div>
        </div>
        {rating == null ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-warn-light text-warn shrink-0">
            Non noté
          </span>
        ) : (
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${RATING_BG[rating]}`}>
            {rating}/5
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = rating === n;
          const cls = active ? RATING_BG[n] : "bg-surface-2 text-ink-2 hover:bg-line";
          return (
            <button
              key={n}
              type="button"
              disabled={pending}
              onClick={() => submit(n)}
              className={`h-9 rounded-md font-mono font-bold text-sm transition-colors disabled:opacity-50 ${cls}`}
              aria-pressed={active}
            >
              {n}
            </button>
          );
        })}
      </div>

      <Textarea
        placeholder="Commentaire confidentiel (optionnel)…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => {
          if (rating != null) saveComment();
        }}
        rows={2}
        className="text-xs"
        disabled={pending}
      />

      {props.history.length > 0 ? (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-ink-3 mr-1">4 dernières :</span>
          {props.history.slice(0, 4).map((h) => (
            <span
              key={h.week_monday}
              title={`Semaine du ${h.week_monday} : ${h.rating}/5`}
              className={`h-3 w-3 rounded-full ${RATING_BG_DOT[h.rating] ?? RATING_BG_DOT[0]}`}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-[11px]"
          disabled={pending || rating == null}
          onClick={saveComment}
        >
          Enregistrer le commentaire
        </Button>
      </div>
    </div>
  );
}
