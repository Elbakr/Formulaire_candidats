"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Phone, Video, MapPin, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRealtime } from "@/hooks/use-realtime";
import { addDays, parseISODate, toISODate, DAY_LABELS } from "@/lib/planning";

type InterviewType = "phone" | "video" | "onsite";
type InterviewStatus = "scheduled" | "done" | "cancelled" | "no_show";

type Interview = {
  id: string;
  scheduled_at: string;
  duration_min: number;
  type: InterviewType;
  status: InterviewStatus;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  application: {
    id: string;
    candidate: { id: string; full_name: string; email: string } | null;
  } | null;
  interviewer_profile: { id: string; full_name: string | null } | null;
};

const HOUR_START = 8;
const HOUR_END = 20; // exclusive
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const ROW_PX = 56; // height of a 1-hour row
const PX_PER_MIN = ROW_PX / 60;

const TYPE_STYLES: Record<InterviewType, { bg: string; border: string; text: string; chip: string; icon: typeof Phone }> = {
  phone: {
    bg: "bg-info-light",
    border: "border-info",
    text: "text-info",
    chip: "bg-info text-white",
    icon: Phone,
  },
  video: {
    bg: "bg-violet-light",
    border: "border-violet",
    text: "text-violet",
    chip: "bg-violet text-white",
    icon: Video,
  },
  onsite: {
    bg: "bg-gold-light",
    border: "border-gold",
    text: "text-gold-dark",
    chip: "bg-gold text-[#1a1a0d]",
    icon: MapPin,
  },
};

const TYPE_LABELS: Record<InterviewType, string> = {
  phone: "Téléphone",
  video: "Vidéo",
  onsite: "Sur place",
};

const STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Planifié",
  done: "Effectué",
  cancelled: "Annulé",
  no_show: "Absent",
};

function localDate(iso: string) {
  return new Date(iso);
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
}

export function AgendaGrid({
  mondayISO,
  weekStartISO,
  weekEndISO,
  interviews,
}: {
  mondayISO: string;
  weekStartISO: string;
  weekEndISO: string;
  interviews: Interview[];
}) {
  const router = useRouter();
  const monday = parseISODate(mondayISO);
  const [selected, setSelected] = useState<Interview | null>(null);

  useRealtime("interviews", () => router.refresh());

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mondayISO],
  );

  const prev = toISODate(addDays(monday, -7));
  const next = toISODate(addDays(monday, 7));
  const todayMonday = toISODate(
    addDays(parseISODate(toISODate(new Date())), -((new Date().getDay() || 7) - 1)),
  );

  // Bucket interviews by day (YYYY-MM-DD local)
  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const it of interviews) {
      const d = localDate(it.scheduled_at);
      const key = toISODate(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [interviews]);

  const todayISO = toISODate(new Date());
  const totalCount = interviews.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Agenda RDV</h1>
          <p className="text-sm text-ink-2">
            Semaine du {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
            {addDays(monday, 6).toLocaleDateString("fr-BE", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            · {totalCount} entretien{totalCount > 1 ? "s" : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-1 items-center flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${prev}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${todayMonday}`}>Aujourd&apos;hui</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${next}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {(["phone", "video", "onsite"] as InterviewType[]).map((t) => {
          const Icon = TYPE_STYLES[t].icon;
          return (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center h-5 w-5 rounded ${TYPE_STYLES[t].chip}`}>
                <Icon className="h-3 w-3" />
              </span>
              {TYPE_LABELS[t]}
            </span>
          );
        })}
        <span className="text-ink-3 ml-2">
          Plage affichée : {HOUR_START}h–{HOUR_END}h
        </span>
        <span className="hidden">
          {weekStartISO} → {weekEndISO}
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(140px, 1fr))" }}>
            {/* Header row */}
            <div className="bg-surface-2 border-b border-line h-12" />
            {days.map((d, i) => {
              const iso = toISODate(d);
              const isToday = iso === todayISO;
              const dayCount = byDay.get(iso)?.length ?? 0;
              return (
                <div
                  key={i}
                  className={`bg-surface-2 border-b border-l border-line h-12 px-2 py-1 text-center ${isToday ? "ring-2 ring-inset ring-gold" : ""}`}
                >
                  <div className="font-bold uppercase tracking-wider text-[10px] text-ink-3">
                    {DAY_LABELS[i]}
                  </div>
                  <div className="font-bold text-sm flex items-center justify-center gap-1.5">
                    {d.getDate()}
                    {dayCount > 0 ? (
                      <Badge variant="muted" className="h-4 px-1.5 text-[9px]">
                        {dayCount}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {/* Body : hour gutter on the left, then 7 columns each containing positioned blocks */}
            <div className="border-r border-line">
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{ height: ROW_PX }}
                  className="text-[10px] text-ink-3 font-mono pr-2 pt-0.5 text-right"
                >
                  {String(h).padStart(2, "0")}h
                </div>
              ))}
            </div>

            {days.map((d, dayIdx) => {
              const iso = toISODate(d);
              const isToday = iso === todayISO;
              const dayInterviews = byDay.get(iso) ?? [];
              return (
                <div
                  key={dayIdx}
                  className={`relative border-l border-line ${isToday ? "bg-gold-light/15" : ""}`}
                  style={{ height: HOURS.length * ROW_PX }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((_, i) =>
                    i === 0 ? null : (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-line/60"
                        style={{ top: i * ROW_PX }}
                      />
                    ),
                  )}

                  {/* Now line */}
                  {isToday ? <NowLine /> : null}

                  {/* Interview blocks */}
                  {dayInterviews.map((it) => {
                    const start = localDate(it.scheduled_at);
                    const startMin = start.getHours() * 60 + start.getMinutes();
                    const dayStartMin = HOUR_START * 60;
                    const dayEndMin = HOUR_END * 60;
                    const blockStartMin = Math.max(dayStartMin, startMin);
                    const blockEndMin = Math.min(dayEndMin, startMin + (it.duration_min || 30));
                    if (blockEndMin <= blockStartMin) return null;
                    const top = (blockStartMin - dayStartMin) * PX_PER_MIN;
                    const height = Math.max(22, (blockEndMin - blockStartMin) * PX_PER_MIN);
                    const styles = TYPE_STYLES[it.type];
                    const Icon = styles.icon;
                    const cancelled = it.status === "cancelled" || it.status === "no_show";
                    const cName = it.application?.candidate?.full_name ?? "Candidat";
                    return (
                      <button
                        key={it.id}
                        onClick={() => setSelected(it)}
                        className={`absolute left-1 right-1 rounded border-l-4 ${styles.border} ${styles.bg} ${styles.text} ${cancelled ? "opacity-60 line-through" : ""} text-left px-2 py-1 hover:shadow-md transition-shadow cursor-pointer overflow-hidden`}
                        style={{ top, height }}
                        title={`${fmtTime(start)} · ${cName} · ${TYPE_LABELS[it.type]}`}
                      >
                        <div className="flex items-center gap-1 text-[10px] font-bold">
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{fmtTime(start)}</span>
                        </div>
                        <div className="text-[11px] font-bold truncate leading-tight">{cName}</div>
                        {height > 50 && it.location ? (
                          <div className="text-[10px] truncate opacity-80">{it.location}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <InterviewDialog interview={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < HOUR_START * 60 || min > HOUR_END * 60) return null;
  const top = (min - HOUR_START * 60) * PX_PER_MIN;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-[2px] bg-danger" />
      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-danger" />
    </div>
  );
}

function InterviewDialog({
  interview,
  onClose,
}: {
  interview: Interview | null;
  onClose: () => void;
}) {
  const open = !!interview;
  if (!interview) return null;
  const start = localDate(interview.scheduled_at);
  const end = new Date(start.getTime() + (interview.duration_min || 30) * 60_000);
  const candidateName = interview.application?.candidate?.full_name ?? "Candidat";
  const Icon = TYPE_STYLES[interview.type].icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            Entretien — {candidateName}
          </DialogTitle>
          <DialogDescription>
            {start.toLocaleDateString("fr-BE", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            · {fmtTime(start)} – {fmtTime(end)}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-3 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">{TYPE_LABELS[interview.type]}</Badge>
            <Badge variant="muted">{STATUS_LABELS[interview.status]}</Badge>
            <Badge variant="muted">{interview.duration_min} min</Badge>
          </div>
          {interview.location ? (
            <div>
              <div className="text-[11px] uppercase font-bold text-ink-3">Lieu</div>
              <div>{interview.location}</div>
            </div>
          ) : null}
          {interview.meeting_url ? (
            <div>
              <div className="text-[11px] uppercase font-bold text-ink-3">Lien visio</div>
              <a
                href={interview.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="text-gold-dark hover:underline break-all"
              >
                {interview.meeting_url}
              </a>
            </div>
          ) : null}
          {interview.interviewer_profile?.full_name ? (
            <div>
              <div className="text-[11px] uppercase font-bold text-ink-3">Intervieweur</div>
              <div>{interview.interviewer_profile.full_name}</div>
            </div>
          ) : null}
          {interview.notes ? (
            <div>
              <div className="text-[11px] uppercase font-bold text-ink-3">Notes</div>
              <div className="whitespace-pre-wrap text-ink-2">{interview.notes}</div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="-mx-5 -mb-3 mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> Fermer
          </Button>
          {interview.application?.id ? (
            <Button asChild variant="gold">
              <Link href={`/rh/candidates/${interview.application.id}`}>Ouvrir la fiche →</Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
