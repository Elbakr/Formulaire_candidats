"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { updateRequestStatusAction } from "@/app/chat/actions";

export function RequestsActions({
  requestId,
  status,
}: {
  requestId: string;
  status: "open" | "in_progress";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function set(s: "in_progress" | "done" | "rejected") {
    startTransition(async () => {
      const r = await updateRequestStatusAction({
        requestId,
        status: s,
        note: note.trim() || undefined,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(
          s === "done" ? "Marquée faite." : s === "rejected" ? "Refusée." : "Prise en charge.",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <input
        type="text"
        placeholder="Note (optionnelle)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-[11px] rounded border border-line bg-canvas px-2 py-1 w-44"
      />
      {status === "open" ? (
        <button
          onClick={() => set("in_progress")}
          disabled={pending}
          className="text-[11px] px-2 py-1 rounded border border-line hover:bg-info-light text-info inline-flex items-center gap-1"
        >
          <PlayCircle className="h-3 w-3" /> Prendre
        </button>
      ) : null}
      <button
        onClick={() => set("done")}
        disabled={pending}
        className="text-[11px] px-2 py-1 rounded border border-line hover:bg-success-light text-success inline-flex items-center gap-1"
      >
        <CheckCircle2 className="h-3 w-3" /> Fait
      </button>
      <button
        onClick={() => set("rejected")}
        disabled={pending}
        className="text-[11px] px-2 py-1 rounded border border-line hover:bg-danger-light text-danger inline-flex items-center gap-1"
      >
        <XCircle className="h-3 w-3" /> Refuser
      </button>
    </div>
  );
}
