"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { submitPoulsAction } from "./actions";

const FACES = ["😞", "😕", "😐", "🙂", "😄"];

export function PoulsClient({ token, lang }: { token: string; lang: "fr" | "nl" }) {
  const [feeling, setFeeling] = useState(0);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const t =
    lang === "nl"
      ? { title: "Hoe voel je je op het werk?", sub: "Deze laatste weken, hoe gaat het?", note: "Iets toe te voegen? (optioneel)", send: "Versturen", thanks: "Bedankt! 🙏 Je mening telt.", labels: ["Slecht", "", "Oké", "", "Top"] }
      : { title: "Comment te sens-tu au travail ?", sub: "Ces dernières semaines, comment ça va ?", note: "Un mot à ajouter ? (facultatif)", send: "Envoyer", thanks: "Merci ! 🙏 Ton avis compte.", labels: ["Pas top", "", "Ça va", "", "Au top"] };

  function submit() {
    if (!feeling) return;
    start(async () => {
      const r = await submitPoulsAction(token, feeling, note);
      if (r.ok) setDone(true);
    });
  }

  return (
    <div className="min-h-[100dvh] bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
        {done ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="text-lg font-bold text-ink mt-2">{t.thanks}</h1>
          </>
        ) : (
          <>
            <div className="text-2xl">💬</div>
            <h1 className="text-lg font-bold text-ink mt-1">{t.title}</h1>
            <p className="text-sm text-ink-2 mt-0.5">{t.sub}</p>
            <div className="flex justify-between gap-1 mt-4">
              {FACES.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFeeling(i + 1)}
                  className={`flex-1 aspect-square rounded-xl text-2xl transition-all ${feeling === i + 1 ? "bg-gold-light ring-2 ring-gold scale-105" : "bg-surface-2 hover:bg-gold-light/50"}`}
                  aria-label={String(i + 1)}
                >
                  {f}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t.note}
              className="mt-3 w-full rounded-lg border border-line text-ink text-sm p-2.5 outline-none focus:border-gold"
            />
            <button
              onClick={submit}
              disabled={pending || !feeling}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-canvas font-bold py-3 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {t.send}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
