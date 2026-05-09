"use client";

import { useTransition, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { scheduleInterviewAction } from "../../actions";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Video, Phone, MapPin } from "lucide-react";

type Interview = {
  id: string;
  scheduled_at: string;
  duration_min: number;
  type: "phone" | "video" | "onsite";
  status: "scheduled" | "done" | "cancelled" | "no_show";
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  interviewer_profile: { id: string; full_name: string | null } | null;
};

const ICONS = { phone: Phone, video: Video, onsite: MapPin };

export function InterviewsPanel({ applicationId, interviews }: { applicationId: string; interviews: Interview[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"phone" | "video" | "onsite">("onsite");

  return (
    <Card>
      <form
        ref={formRef}
        action={(fd) => {
          fd.set("application_id", applicationId);
          fd.set("type", type);
          startTransition(async () => {
            const res = await scheduleInterviewAction(fd);
            if (res?.error) toast.error(res.error);
            else {
              toast.success("Entretien planifié.");
              formRef.current?.reset();
            }
          });
        }}
        className="p-4 border-b border-line"
      >
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="scheduled_at">Date & heure</Label>
            <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
          </div>
          <div>
            <Label htmlFor="duration_min">Durée (min)</Label>
            <Input id="duration_min" name="duration_min" type="number" defaultValue={30} min={5} max={240} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="onsite">Sur place</SelectItem>
                <SelectItem value="video">Visio</SelectItem>
                <SelectItem value="phone">Téléphone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="location">{type === "video" ? "Lien visio" : type === "phone" ? "Numéro" : "Lieu"}</Label>
            <Input
              id={type === "video" ? "meeting_url" : "location"}
              name={type === "video" ? "meeting_url" : "location"}
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button type="submit" variant="gold" disabled={pending}>
            {pending ? "Planification…" : "Planifier l'entretien"}
          </Button>
        </div>
      </form>

      <div className="p-4">
        {interviews.length === 0 ? (
          <p className="text-sm text-ink-3">Aucun entretien planifié.</p>
        ) : (
          <ul className="space-y-2">
            {interviews.map((iv) => {
              const Icon = ICONS[iv.type];
              return (
                <li key={iv.id} className="bg-surface-2 rounded-md p-3 text-sm flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{formatDateTime(iv.scheduled_at)} · {iv.duration_min} min</div>
                    <div className="text-xs text-ink-3 mt-0.5">
                      {iv.location ?? iv.meeting_url ?? "—"}
                      {iv.interviewer_profile?.full_name ? ` · avec ${iv.interviewer_profile.full_name}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-ink-2">{iv.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
