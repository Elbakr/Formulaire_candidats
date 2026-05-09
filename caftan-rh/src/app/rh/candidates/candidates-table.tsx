"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Mail, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRealtime } from "@/hooks/use-realtime";
import { PIPELINE_STAGES } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import type { ApplicationListItem } from "@/lib/queries";
import type { ApplicationStatus } from "@/types/database.types";
import { EmailSendDialog } from "@/components/email-send-dialog";

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

export function CandidatesTable({
  initialData,
  templates,
}: {
  initialData: ApplicationListItem[];
  templates: Template[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);

  useRealtime("applications", () => router.refresh());

  function applyDatePreset(preset: string) {
    setDatePreset(preset);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().split("T")[0];
    switch (preset) {
      case "today": setDateFrom(iso(today)); setDateTo(iso(today)); break;
      case "7d": {
        const d = new Date(today.getTime() - 7 * 86_400_000);
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "30d": {
        const d = new Date(today.getTime() - 30 * 86_400_000);
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "3m": {
        const d = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "year":
        setDateFrom(`${today.getFullYear()}-01-01`); setDateTo(iso(today)); break;
      case "all":
      default:
        setDateFrom(""); setDateTo(""); break;
    }
  }

  const sources = useMemo(() => {
    const s = new Set<string>();
    for (const a of initialData) if (a.candidate.source) s.add(a.candidate.source);
    return Array.from(s).sort();
  }, [initialData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return initialData.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (sourceFilter !== "all" && a.candidate.source !== sourceFilter) return false;
      if (fromMs || toMs) {
        const t = new Date(a.candidate.applied_at).getTime();
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
      }
      if (!q) return true;
      return (
        a.candidate.full_name.toLowerCase().includes(q) ||
        a.candidate.email.toLowerCase().includes(q) ||
        (a.candidate.city ?? "").toLowerCase().includes(q) ||
        (a.job?.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialData, search, statusFilter, sourceFilter, dateFrom, dateTo]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.every((a) => next.has(a.id));
      if (allSelected) for (const a of filtered) next.delete(a.id);
      else for (const a of filtered) next.add(a.id);
      return next;
    });
  }

  const selectedIds = Array.from(selected);
  const selectedApps = initialData.filter((a) => selected.has(a.id));
  const recipientPreview = selectedApps.length === 1
    ? selectedApps[0].candidate.full_name
    : `${selectedApps.length} candidats`;

  const allVisibleSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  return (
    <>
      <Card>
        <div className="p-3 border-b border-line space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer pr-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-4 w-4 rounded border-line"
              />
              <span className="text-xs font-semibold text-ink-2">{allVisibleSelected ? "Désélectionner tout" : "Sélectionner tout"}</span>
            </label>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <Input
                placeholder="Rechercher nom, email, ville, offre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtre date d'inscription */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-ink-3 uppercase tracking-wider">Date inscription :</span>
            {[
              ["all", "Tout"],
              ["today", "Aujourd'hui"],
              ["7d", "7 jours"],
              ["30d", "30 jours"],
              ["3m", "3 mois"],
              ["year", "Cette année"],
              ["custom", "Personnalisé"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => k === "custom" ? setDatePreset("custom") : applyDatePreset(k)}
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition ${
                  datePreset === k
                    ? "bg-violet text-white border-violet"
                    : "bg-surface border-line text-ink-2 hover:border-violet"
                }`}
              >
                {label}
              </button>
            ))}
            {datePreset === "custom" ? (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
                <span className="text-ink-3">→</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
              </>
            ) : null}
            {(dateFrom || dateTo) ? (
              <span className="ml-auto text-ink-2 font-mono">
                {filtered.length} / {initialData.length} candidats
              </span>
            ) : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-3">Aucune candidature trouvée.</div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((app) => {
              const checked = selected.has(app.id);
              return (
                <div
                  key={app.id}
                  className={`flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors ${checked ? "bg-gold-light/30" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(app.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-line shrink-0"
                  />
                  <Link href={`/rh/candidates/${app.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <NameAvatar name={app.candidate.full_name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{app.candidate.full_name}</div>
                      <div className="text-xs text-ink-3 truncate flex items-center gap-2">
                        <span>{app.candidate.email}</span>
                        {app.candidate.city ? <span>· {app.candidate.city}</span> : null}
                      </div>
                    </div>
                    <div className="hidden md:block text-xs text-ink-2 max-w-[160px] truncate">
                      {app.job?.title ?? "Spontanée"}
                    </div>
                    <div className="text-[11px] text-ink-3 hidden sm:flex flex-col items-end">
                      <span>Inscrit le {formatDate(app.candidate.applied_at)}</span>
                      {app.candidate.source ? <span className="text-[10px] opacity-70">via {app.candidate.source}</span> : null}
                    </div>
                    <Badge variant={app.status as ApplicationStatus}>{STATUS_LABELS[app.status]}</Badge>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur-xl text-white px-5 py-3 flex items-center gap-3 border-t border-white/10">
          <span className="font-bold text-sm">{selected.size} candidat{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" /> Tout désélectionner
            </Button>
            <Button variant="gold" onClick={() => setEmailOpen(true)}>
              <Mail className="h-4 w-4" /> Envoyer email ({selected.size})
            </Button>
          </div>
        </div>
      ) : null}

      <EmailSendDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        applicationIds={selectedIds}
        recipientPreview={recipientPreview}
        templates={templates}
      />
    </>
  );
}
