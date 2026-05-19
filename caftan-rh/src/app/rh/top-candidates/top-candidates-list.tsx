"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight, MapPin, Languages, Calendar, User, Mail, X, CheckSquare, Square, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { sendEmailViaEmailJS } from "@/lib/emailjs-client";

export type TopCandidateRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  match_score: number | null;
  match_breakdown: {
    proximity: number; languages: number; age: number; freshness: number;
    city_label: string; age_value: number | null; langs_summary: string;
    days_since_applied: number | null;
  } | null;
  application_id: string | null;
};

function scoreColor(s: number | null): string {
  if (s === null) return "bg-ink-3/20 text-ink-3";
  if (s >= 80) return "bg-success text-white";
  if (s >= 60) return "bg-gold text-[#1a1a0d]";
  if (s >= 40) return "bg-warn text-white";
  return "bg-ink-3/30 text-ink-3";
}
function scoreLabel(s: number | null): string {
  if (s === null) return "Non scoré";
  if (s >= 80) return "Excellent"; if (s >= 60) return "Bon";
  if (s >= 40) return "Moyen"; return "Faible";
}
function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function TopCandidatesList({ rows }: { rows: TopCandidateRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Bonjour {{firstname}},\n\n");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.email),
    [rows, selected],
  );
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function clearSelection() { setSelected(new Set()); }

  async function sendBulk() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Sujet et corps requis.");
      return;
    }
    setSending(true);
    setProgress({ done: 0, total: selectedRows.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < selectedRows.length; i++) {
      const c = selectedRows[i];
      const firstname = c.full_name.split(/\s+/)[0] ?? c.full_name;
      const personalizedBody = body
        .replace(/\{\{firstname\}\}/g, firstname)
        .replace(/\{\{fullname\}\}/g, c.full_name);
      const personalizedSubject = subject
        .replace(/\{\{firstname\}\}/g, firstname)
        .replace(/\{\{fullname\}\}/g, c.full_name);
      const r = await sendEmailViaEmailJS({
        to_email: c.email!,
        to_name: c.full_name,
        subject: personalizedSubject,
        body_text: personalizedBody,
      });
      if (!r.ok) errors++;
      setProgress({ done: i + 1, total: selectedRows.length, errors });
    }
    setSending(false);
    if (errors === 0) {
      toast.success(`${selectedRows.length} email(s) envoyé(s) via la messagerie intégrée.`);
      setOpen(false);
      setSelected(new Set());
    } else {
      toast.error(`${selectedRows.length - errors}/${selectedRows.length} envoyés. ${errors} échec(s).`, { duration: 10000 });
    }
  }

  return (
    <>
      <Card>
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 bg-surface-2 border-b border-line flex items-center gap-3">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1 hover:text-ink"
            title={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          >
            {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            <span>{allSelected ? "Tout désélectionner" : "Tout sélectionner"}</span>
          </button>
          <span className="text-ink-3">·</span>
          <span>{rows.length} candidat{rows.length > 1 ? "s" : ""}</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">
            Aucun candidat à ce seuil. Baisse-le ou relance le recalcul des scores.
          </div>
        ) : (
          <ul>
            {rows.map((c, idx) => {
              const b = c.match_breakdown;
              const age = calcAge(c.birth_date);
              const fiche = c.application_id ? `/rh/candidates/${c.application_id}` : null;
              const isChecked = selected.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 p-3 border-b border-line last:border-b-0 transition-colors ${isChecked ? "bg-gold-light/40" : "hover:bg-surface-2"}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 cursor-pointer shrink-0"
                    title={c.email ? "Sélectionner pour mail bulk" : "Pas d'email — non envoyable"}
                    disabled={!c.email}
                  />
                  <div className="text-xs font-mono text-ink-3 w-6 text-right">{idx + 1}</div>
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-sm shrink-0 ${scoreColor(c.match_score)}`}
                    title={scoreLabel(c.match_score)}
                  >
                    {c.match_score ?? "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {fiche ? (
                      <Link href={fiche} className="font-bold text-sm hover:text-gold-dark truncate block">
                        {c.full_name}
                        {age !== null ? <span className="font-normal text-ink-3 ml-2">· {age} ans</span> : null}
                      </Link>
                    ) : (
                      <span className="font-bold text-sm truncate block">
                        {c.full_name}
                        {age !== null ? <span className="font-normal text-ink-3 ml-2">· {age} ans</span> : null}
                      </span>
                    )}
                    <div className="text-xs text-ink-2 truncate">
                      {c.email ?? "(pas d'email)"} · {c.phone ?? "—"}
                    </div>
                    {b ? (
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                        <span className="inline-flex items-center gap-1 text-ink-3"><MapPin className="h-3 w-3" />{b.city_label} ({b.proximity}/25)</span>
                        <span className="inline-flex items-center gap-1 text-ink-3"><Languages className="h-3 w-3" />{b.langs_summary} ({b.languages}/25)</span>
                        <span className="inline-flex items-center gap-1 text-ink-3"><User className="h-3 w-3" />{b.age_value ?? "?"} ans ({b.age}/25)</span>
                        <span className="inline-flex items-center gap-1 text-ink-3"><Calendar className="h-3 w-3" />{b.days_since_applied ?? "?"}j ({b.freshness}/25)</span>
                      </div>
                    ) : null}
                  </div>
                  {fiche ? (
                    <Link href={fiche} className="inline-flex items-center gap-1 text-xs font-bold text-gold-dark hover:underline shrink-0">
                      Fiche <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : <span className="text-xs text-ink-3 shrink-0">—</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Bulk action bar */}
      {selectedRows.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur-xl text-white px-5 py-3 flex items-center gap-3 border-t border-white/10">
          <span className="font-bold text-sm">{selectedRows.length} candidat{selectedRows.length > 1 ? "s" : ""} sélectionné{selectedRows.length > 1 ? "s" : ""}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white" onClick={clearSelection}>
              <X className="h-4 w-4" /> Désélectionner
            </Button>
            <Button variant="gold" onClick={() => setOpen(true)}>
              <Mail className="h-4 w-4" /> Envoyer email ({selectedRows.length})
            </Button>
          </div>
        </div>
      ) : null}

      {/* Bulk email dialog */}
      <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Envoyer un email à {selectedRows.length} candidat{selectedRows.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Via la messagerie intégrée (EmailJS). Variables disponibles : <code>{"{{firstname}}"}</code>, <code>{"{{fullname}}"}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Sujet</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Caftan Factory — invitation entretien"
                disabled={sending}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Message</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                disabled={sending}
                placeholder="Bonjour {{firstname}},..."
              />
            </div>
            {sending ? (
              <div className="rounded-md border border-line bg-surface-2 p-3 text-xs">
                <div className="font-bold mb-1">Envoi en cours : {progress.done}/{progress.total}</div>
                <div className="h-1.5 bg-line rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                {progress.errors > 0 ? <div className="text-danger mt-1">{progress.errors} échec(s)</div> : null}
              </div>
            ) : null}
            <div className="text-[11px] text-ink-3 max-h-24 overflow-auto">
              Destinataires : {selectedRows.slice(0, 8).map((c) => c.email).join(", ")}
              {selectedRows.length > 8 ? ` … (+${selectedRows.length - 8} autres)` : ""}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>Annuler</Button>
            <Button variant="gold" onClick={sendBulk} disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
