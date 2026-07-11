"use client";

// Karim 2026-07-11 : bandeau fiche travailleur — s'affiche quand le titre de
// séjour / CI expire dans ≤ 45 j (ou est expiré). Permet à l'admin de VALIDER
// l'envoi du rappel au travailleur en 1 clic (envoi manuel, jamais auto).

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Send, Check } from "lucide-react";
import { toast } from "sonner";
import { sendDocExpiryReminderAction } from "./doc-expiry-actions";

const WINDOW = 45;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${d} ${months[(m || 1) - 1]} ${y}`;
}

export function DocExpiryReminderBanner({
  employeeId,
  expiry,
  reminderAt,
}: {
  employeeId: string;
  expiry: string | null;
  reminderAt: string | null;
}) {
  const [sentAt, setSentAt] = useState<string | null>(reminderAt);
  const [pending, start] = useTransition();

  if (!expiry) return null;
  const days = Math.round(
    (Date.parse(expiry.slice(0, 10) + "T00:00:00Z") - Date.now()) / 86_400_000,
  );
  if (days > WINDOW) return null; // rien à signaler encore

  const expired = days < 0;

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
      className={`rounded-lg border p-3 flex flex-wrap items-center gap-3 ${
        expired ? "border-danger bg-danger/5" : "border-amber-300 bg-amber-50"
      }`}
    >
      <CalendarClock className={`h-5 w-5 shrink-0 ${expired ? "text-danger" : "text-amber-600"}`} />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-bold text-ink">
          {expired
            ? `Titre de séjour / CI EXPIRÉ le ${fmtDate(expiry)}`
            : `Titre de séjour / CI expire le ${fmtDate(expiry)} (dans ${days} j)`}
        </div>
        <div className="text-xs text-ink-2">
          Valide l&apos;envoi du rappel au travailleur (renouvellement + copie du nouveau document).
          {sentAt ? (
            <span className="ml-1 font-semibold text-emerald-700">
              Déjà envoyé le {fmtDate(sentAt.slice(0, 10))}.
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
          expired ? "bg-danger hover:bg-danger/90" : "bg-gold hover:bg-gold-dark"
        }`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : sentAt ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {sentAt ? "Renvoyer le rappel" : "Envoyer le rappel"}
      </button>
    </div>
  );
}
