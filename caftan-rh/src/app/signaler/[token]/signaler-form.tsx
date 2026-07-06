"use client";

import { useState, useTransition } from "react";
import { Send, Loader2, CheckCircle2, HeartHandshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitWorkerReportAction } from "./actions";

type Locale = "fr" | "nl";

const CATEGORIES: Array<{ value: string; fr: string; nl: string }> = [
  { value: "remarque", fr: "Remarque", nl: "Opmerking" },
  { value: "anomalie", fr: "Anomalie", nl: "Probleem" },
  { value: "info", fr: "Info", nl: "Info" },
  { value: "autre", fr: "Autre", nl: "Andere" },
];

const COPY = {
  fr: {
    title: "Signaler à la direction",
    intro:
      "Une remarque, une info, une anomalie ? Écris-la ici : ton message est transmis directement à la direction.",
    categoryLabel: "Type de message",
    messageLabel: "Ton message",
    placeholder: "Écris ton message ici…",
    send: "Envoyer à la direction",
    sending: "Envoi…",
    empty: "Merci d'écrire un message avant d'envoyer.",
    thanksTitle: "Merci, ton message a bien été transmis à la direction",
    thanksBody:
      "La direction a reçu ton message et y donnera suite. Ce lien reste valable pendant tout ton contrat : garde-le, tu peux revenir écrire à tout moment.",
    another: "Envoyer un autre message",
  },
  nl: {
    title: "Melden aan de directie",
    intro:
      "Een opmerking, info of een probleem? Schrijf het hier: je bericht gaat rechtstreeks naar de directie.",
    categoryLabel: "Type bericht",
    messageLabel: "Jouw bericht",
    placeholder: "Schrijf hier je bericht…",
    send: "Naar de directie sturen",
    sending: "Versturen…",
    empty: "Schrijf een bericht voor je verstuurt.",
    thanksTitle: "Bedankt, je bericht is goed aangekomen bij de directie",
    thanksBody:
      "De directie heeft je bericht ontvangen en volgt het op. Deze link blijft geldig gedurende je hele contract: bewaar hem, je kan altijd terugkomen om te schrijven.",
    another: "Nog een bericht sturen",
  },
} as const;

export function SignalerForm({ token, locale }: { token: string; locale: Locale }) {
  const c = COPY[locale];
  const [category, setCategory] = useState("remarque");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Card className="p-6 border-success bg-success-light/40">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-8 w-8 flex-shrink-0 text-success mt-0.5" />
          <div>
            <h1 className="font-bold text-base text-ink">{c.thanksTitle}</h1>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">{c.thanksBody}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setMessage("");
                setCategory("remarque");
                setError(null);
                setDone(false);
              }}
            >
              {c.another}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  function onSubmit() {
    setError(null);
    if (message.trim().length === 0) {
      setError(c.empty);
      return;
    }
    start(async () => {
      const res = await submitWorkerReportAction({ token, category, message });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <HeartHandshake className="h-6 w-6 flex-shrink-0 text-gold mt-0.5" />
        <div>
          <h1 className="font-bold text-lg text-ink">{c.title}</h1>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">{c.intro}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-2 block mb-1.5">{c.categoryLabel}</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const active = cat.value === category;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-ink text-white border-ink"
                    : "bg-white text-ink-2 border-line hover:bg-surface-2"
                }`}
              >
                {locale === "nl" ? cat.nl : cat.fr}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-2 block mb-1.5">{c.messageLabel}</label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={c.placeholder}
          rows={6}
          maxLength={5000}
        />
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <Button variant="gold" onClick={onSubmit} disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {pending ? c.sending : c.send}
      </Button>
    </Card>
  );
}
