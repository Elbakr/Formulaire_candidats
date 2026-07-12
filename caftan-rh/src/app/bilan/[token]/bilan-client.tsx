"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, Star } from "lucide-react";
import { submitBilanAction } from "./actions";

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={String(n)}>
          <Star className={`h-6 w-6 ${n <= value ? "fill-gold text-gold" : "text-line"}`} />
        </button>
      ))}
    </div>
  );
}

export function BilanClient({ token, lang, firstName }: { token: string; lang: "fr" | "nl"; firstName: string }) {
  const [r, setR] = useState({ training: 0, colleagues: 0, work: 0, salary: 0, schedule: 0 });
  const [free, setFree] = useState("");
  const [avail, setAvail] = useState<boolean | null>(null);
  const [cand, setCand] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const t =
    lang === "nl"
      ? { hi: `Bedankt voor alles${firstName ? ", " + firstName : ""} 💛`, sub: "Jouw eerlijke mening helpt ons enorm. Het duurt 2 minuten.", rows: { training: "De opleiding", colleagues: "De collega's", work: "Het werk", salary: "Het loon", schedule: "De uren" }, free: "Wil je iets kwijt? (optioneel)", availQ: "Mogen we in de toekomst nog op je rekenen?", candQ: "Wil je kandidaat blijven voor toekomstige kansen?", yes: "Ja", no: "Nee", note: "Een woordje voor ons? (optioneel)", send: "Versturen", thanks: "Bedankt van harte! 💛" }
      : { hi: `Merci pour tout${firstName ? ", " + firstName : ""} 💛`, sub: "Ton avis sincère nous aide énormément. Ça prend 2 minutes.", rows: { training: "La formation", colleagues: "Les collègues", work: "Le travail", salary: "Le salaire", schedule: "Les horaires" }, free: "Envie de nous dire quelque chose ? (facultatif)", availQ: "Serais-tu encore dispo si on a besoin de toi ?", candQ: "Souhaites-tu rester candidat(e) pour de futures opportunités ?", yes: "Oui", no: "Non", note: "Un mot pour nous ? (facultatif)", send: "Envoyer", thanks: "Merci du fond du cœur ! 💛" };

  function submit() {
    start(async () => {
      const res = await submitBilanAction(token, {
        rating_training: r.training,
        rating_colleagues: r.colleagues,
        rating_work: r.work,
        rating_salary: r.salary,
        rating_schedule: r.schedule,
        free_text: free,
        available_again: avail,
        wants_candidate: cand,
        availability_note: note,
      });
      if (res.ok) setDone(true);
    });
  }

  const YesNo = ({ v, set }: { v: boolean | null; set: (b: boolean) => void }) => (
    <div className="flex gap-2">
      <button type="button" onClick={() => set(true)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${v === true ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-line"}`}>
        {t.yes}
      </button>
      <button type="button" onClick={() => set(false)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${v === false ? "border-red-400 bg-red-50 text-red-800" : "border-line"}`}>
        {t.no}
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-ink py-6 px-4">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <h1 className="text-xl font-bold text-ink mt-2">{t.thanks}</h1>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-ink">{t.hi}</h1>
              <p className="text-sm text-ink-2 mt-1">{t.sub}</p>
              <div className="mt-4 space-y-3">
                {(Object.keys(t.rows) as Array<keyof typeof t.rows>).map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{t.rows[k]}</span>
                    <Stars value={r[k]} onChange={(v) => setR((s) => ({ ...s, [k]: v }))} />
                  </div>
                ))}
              </div>
              <textarea value={free} onChange={(e) => setFree(e.target.value)} rows={3} placeholder={t.free} className="mt-4 w-full rounded-lg border border-line text-ink text-sm p-2.5 outline-none focus:border-gold" />
              <div className="mt-4">
                <div className="text-sm font-semibold text-ink mb-1.5">{t.availQ}</div>
                <YesNo v={avail} set={setAvail} />
              </div>
              <div className="mt-3">
                <div className="text-sm font-semibold text-ink mb-1.5">{t.candQ}</div>
                <YesNo v={cand} set={setCand} />
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t.note} className="mt-3 w-full rounded-lg border border-line text-ink text-sm p-2.5 outline-none focus:border-gold" />
              <button onClick={submit} disabled={pending} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-canvas font-bold py-3 disabled:opacity-50">
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {t.send}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
