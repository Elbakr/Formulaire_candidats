"use client";

import { useState, useTransition, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addNoteAction } from "../../actions";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Lock } from "lucide-react";

type Note = {
  id: string;
  body: string;
  is_private: boolean;
  created_at: string;
  author: { id: string; full_name: string | null } | null;
};

export function NotesPanel({ applicationId, notes }: { applicationId: string; notes: Note[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <Card>
      <form
        ref={formRef}
        action={(fd) => {
          fd.set("application_id", applicationId);
          if (isPrivate) fd.set("is_private", "on");
          startTransition(async () => {
            const res = await addNoteAction(fd);
            if (res?.error) toast.error(res.error);
            else {
              toast.success("Note ajoutée.");
              formRef.current?.reset();
            }
          });
        }}
        className="p-4 border-b border-line space-y-2"
      >
        <Label htmlFor="body">Ajouter une note</Label>
        <Textarea id="body" name="body" placeholder="Observation, retour entretien…" required minLength={2} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-line"
            />
            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Privée (pas visible par le candidat)</span>
          </label>
          <Button type="submit" variant="gold" disabled={pending}>
            {pending ? "Enregistrement…" : "Ajouter"}
          </Button>
        </div>
      </form>
      <div className="p-4">
        {notes.length === 0 ? (
          <p className="text-sm text-ink-3">Aucune note pour l'instant.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="bg-surface-2 rounded-md p-3 text-sm">
                <div className="text-[11px] text-ink-3 mb-1 flex items-center gap-2">
                  <span className="font-bold text-ink-2">{n.author?.full_name ?? "—"}</span>
                  <span>·</span>
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.is_private ? <span className="inline-flex items-center gap-0.5 text-warn"><Lock className="h-3 w-3" /> privée</span> : null}
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
