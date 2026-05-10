"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  adminMarkAbsenceResolvedAction,
  adminMarkAbsenceUnfilledAction,
} from "@/app/me/absence/actions";
import { formatDate } from "@/lib/utils";

type Absence = {
  id: string;
  date: string;
  reason: string;
  status: string;
  justification_url: string | null;
  notes: string | null;
  reported_at: string;
  resolved_at: string | null;
  employee: { id: string; full_name: string } | null;
  replacement: { id: string; full_name: string } | null;
  shift: {
    date: string;
    start_time: string;
    end_time: string;
    site: { code: string; name: string } | null;
  } | null;
};

const REASON_LABELS: Record<string, string> = {
  sick: "Maladie",
  family_emergency: "Urgence familiale",
  transport: "Transport",
  other: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  reported: "Signalée",
  covered: "Couverte",
  unfilled: "Non couverte",
  resolved: "Résolue",
};

const STATUS_STYLES: Record<string, string> = {
  reported: "bg-warn-light text-warn",
  covered: "bg-success-light text-success",
  unfilled: "bg-danger-light text-danger",
  resolved: "bg-info-light text-info",
};

export function AdminAbsencesClient({ absences }: { absences: Absence[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const sites = useMemo(() => {
    const set = new Set<string>();
    for (const a of absences) {
      if (a.shift?.site?.code) set.add(a.shift.site.code);
    }
    return Array.from(set).sort();
  }, [absences]);

  const filtered = absences.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (siteFilter !== "all" && a.shift?.site?.code !== siteFilter) return false;
    if (dateFrom && a.date < dateFrom) return false;
    if (dateTo && a.date > dateTo) return false;
    return true;
  });

  function resolve(id: string) {
    startTransition(async () => {
      const r = await adminMarkAbsenceResolvedAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Absence marquée résolue.");
        router.refresh();
      }
    });
  }

  function unfilled(id: string) {
    if (!confirm("Marquer comme non couverte ?")) return;
    startTransition(async () => {
      const r = await adminMarkAbsenceUnfilledAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Absence marquée non couverte.");
        router.refresh();
      }
    });
  }

  return (
    <>
      <Card>
        <div className="p-3 border-b border-line grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
              Statut
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
              Site
            </label>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
              Du
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
              Au
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Aucune absence ne correspond aux filtres.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((a) => (
              <div key={a.id} className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[a.status] ?? "bg-surface-2 text-ink-3"}`}
                  >
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                  <span className="text-sm font-bold">
                    {a.employee?.full_name ?? "—"}
                  </span>
                  <span className="text-xs text-ink-3">
                    · {formatDate(a.date)} · {REASON_LABELS[a.reason] ?? a.reason}
                  </span>
                </div>
                {a.shift ? (
                  <div className="text-xs text-ink-2">
                    Shift : {a.shift.start_time.slice(0, 5)}–{a.shift.end_time.slice(0, 5)}
                    {a.shift.site ? ` · Site ${a.shift.site.code}` : ""}
                  </div>
                ) : (
                  <div className="text-xs text-ink-3 italic">
                    Aucun shift planifié pour cette date — transmis info uniquement.
                  </div>
                )}
                {a.replacement ? (
                  <div className="text-xs text-success">
                    Remplaçant : <strong>{a.replacement.full_name}</strong>
                  </div>
                ) : null}
                {a.notes ? (
                  <div className="text-xs text-ink-3 italic">"{a.notes}"</div>
                ) : null}
                {a.justification_url ? (
                  <a
                    href={a.justification_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-info underline"
                  >
                    Justificatif
                  </a>
                ) : null}
                {a.status === "reported" || a.status === "covered" ? (
                  <div className="flex gap-2 pt-1">
                    {a.status !== "covered" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => unfilled(a.id)}
                        disabled={pending}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Non couverte
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="gold"
                      onClick={() => resolve(a.id)}
                      disabled={pending}
                    >
                      <Check className="h-3.5 w-3.5" /> Marquer résolue
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
