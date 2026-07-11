"use client";

// Karim 2026-07-11 : bandeau fiche — documents (titre de séjour + valise) proches
// de l'expiration (≤ 45 j) ou expirés. L'admin VALIDE l'envoi du rappel échelonné
// au travailleur en 1 clic (envoi manuel, jamais auto).

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Send, Check } from "lucide-react";
import { toast } from "sonner";
import { sendDocExpiryReminderAction } from "./doc-expiry-actions";

export type ExpiryItem = { label: string; expiry: string; days: number };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${d} ${months[(m || 1) - 1]} ${y}`;
}

export function DocExpiryReminderBanner({
  employeeId,
  items,
  reminderAt,
}: {
  employeeId: string;
  items: ExpiryItem[];
  reminderAt: string | null;
}) {
  const [sentAt, setSentAt] = useState<string | null>(reminderAt);
  const [pending, start] = useTransition();

  if (!items || items.length === 0) return null;
  const minDays = Math.min(...items.map((i) => i.days));
  const expired = minDays < 0;

  function send() {
    start(async () => {
      const r = await sendDocExpiryReminderAction(employeeId);
      if (r.ok) {
        setSentAt(new Date().toISOString());
        toast.success(`Rappel envoyé au travailleur (${r.to ?? "email"}).`);
      } else {
        toast.error(r.error ?? "Échec de l'envoi.");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        expired ? "border-danger bg-danger/5" : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <CalendarClock className={`h-5 w-5 shrink-0 ${expired ? "text-danger" : "text-amber-600"}`} />
        <div className="font-bold text-ink text-sm">
          {expired ? "Document(s) à mettre à jour — ÉCHÉANCE atteinte" : `Document(s) à mettre à jour (dans ${minDays} j)`}
        </div>
      </div>
      <ul className="text-[12px] text-ink-2 space-y-0.5 pl-7">
        {items.map((i, idx) => (
          <li key={idx} className={i.days < 0 ? "text-danger font-semibold" : i.days <= 7 ? "text-amber-700 font-semibold" : ""}>
            {i.label} — <strong>{fmtDate(i.expiry)}</strong>{" "}
            {i.days < 0 ? "(expiré)" : i.days === 0 ? "(aujourd'hui)" : `(dans ${i.days} j)`}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
            expired ? "bg-danger hover:bg-danger/90" : "bg-gold hover:bg-gold-dark"
          }`}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : sentAt ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {sentAt ? "Renvoyer le rappel" : "Envoyer le rappel"}
        </button>
        {sentAt ? (
          <span className="text-[11px] text-emerald-700 font-semibold">
            Dernier envoi : {fmtDate(sentAt.slice(0, 10))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
