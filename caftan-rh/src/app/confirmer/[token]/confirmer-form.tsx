"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmGuideAckAction } from "./actions";

type Locale = "fr" | "nl";

const COPY = {
  fr: {
    title: "Confirmation obligatoire",
    intro: "Coche les 4 cases pour confirmer que tu as bien pris connaissance du guide.",
    read: "J'ai lu ce guide",
    understood: "J'ai compris ce guide",
    assimilated: "J'ai assimilé ce guide",
    accepted: "J'accepte de respecter ce guide",
    confirm: "Confirmer",
    confirming: "Envoi…",
    thanksTitle: "Merci, ta confirmation est enregistrée",
    thanksBody:
      "La direction a bien reçu ta confirmation (lu, compris, assimilé, accepté). Tu peux revenir relire ce guide à tout moment.",
    error: "Une erreur est survenue. Réessaie.",
  },
  nl: {
    title: "Verplichte bevestiging",
    intro: "Vink de 4 vakjes aan om te bevestigen dat je de gids goed hebt gelezen.",
    read: "Ik heb deze gids gelezen",
    understood: "Ik heb deze gids begrepen",
    assimilated: "Ik heb deze gids me eigen gemaakt",
    accepted: "Ik aanvaard deze gids na te leven",
    confirm: "Bevestigen",
    confirming: "Versturen…",
    thanksTitle: "Bedankt, je bevestiging is geregistreerd",
    thanksBody:
      "De directie heeft je bevestiging goed ontvangen (gelezen, begrepen, eigen gemaakt, aanvaard). Je kan deze gids altijd opnieuw lezen.",
    error: "Er is een fout opgetreden. Probeer opnieuw.",
  },
} as const;

export function ConfirmerForm({
  token,
  locale,
}: {
  token: string;
  locale: Locale;
}) {
  const c = COPY[locale];
  const [read, setRead] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [assimilated, setAssimilated] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const allChecked = read && understood && assimilated && accepted;

  if (done) {
    return (
      <Card className="p-6 border-success bg-success-light/40">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-success mt-0.5" />
          <div>
            <h2 className="font-bold text-base text-ink">{c.thanksTitle}</h2>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">{c.thanksBody}</p>
          </div>
        </div>
      </Card>
    );
  }

  function onSubmit() {
    setError(null);
    if (!allChecked) return;
    start(async () => {
      const res = await confirmGuideAckAction({ token });
      if (res.ok) setDone(true);
      else setError(res.error || c.error);
    });
  }

  const rows: Array<{ label: string; value: boolean; set: (v: boolean) => void }> = [
    { label: c.read, value: read, set: setRead },
    { label: c.understood, value: understood, set: setUnderstood },
    { label: c.assimilated, value: assimilated, set: setAssimilated },
    { label: c.accepted, value: accepted, set: setAccepted },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-6 w-6 flex-shrink-0 text-gold mt-0.5" />
        <div>
          <h2 className="font-bold text-lg text-ink">{c.title}</h2>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">{c.intro}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <label
            key={r.label}
            className="flex items-center gap-3 rounded-lg border border-line p-3 cursor-pointer hover:bg-surface-2 transition-colors"
          >
            <input
              type="checkbox"
              checked={r.value}
              onChange={(e) => r.set(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-gold"
            />
            <span className="text-sm font-medium text-ink">{r.label}</span>
          </label>
        ))}
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <Button
        variant="gold"
        onClick={onSubmit}
        disabled={pending || !allChecked}
        className="w-full sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {pending ? c.confirming : c.confirm}
      </Button>
    </Card>
  );
}
