"use client";

// Karim 2026-07-09 (Phase 3) : UI tablette plein écran. Deux écrans :
//  1) clavier numérique (gros boutons tactiles) pour saisir le code personnel ;
//  2) planning par défaut du travailleur en LECTURE SEULE (prénom, semaines,
//     jours, horaires, pauses, total) + bouton « Fermer » pour le suivant.
// FR, thème clair uniquement. Aucune donnée interne, aucune navigation app.

import { useState, useTransition } from "react";
import { Delete, LogOut, Loader2, CalendarClock, Coffee } from "lucide-react";
import { resolvePlanningByCodeAction, type TabletPlanning, type TabletShift } from "./actions";

const FR_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MAX_LEN = 8;

function fmtDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${FR_DAYS[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function fmtRange(startISO: string, endISO: string): string {
  const f = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  };
  return `${f(startISO)} – ${f(endISO)}`;
}

export function TabletteClient() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<TabletPlanning | null>(null);
  const [pending, start] = useTransition();

  function press(digit: string) {
    if (pending || planning) return;
    setError(null);
    setCode((c) => (c.length >= MAX_LEN ? c : c + digit));
  }
  function back() {
    if (pending || planning) return;
    setError(null);
    setCode((c) => c.slice(0, -1));
  }
  function clearAll() {
    if (pending || planning) return;
    setError(null);
    setCode("");
  }

  function submit() {
    if (pending || code.length === 0) return;
    setError(null);
    start(async () => {
      const r = await resolvePlanningByCodeAction(code);
      if (r.ok) {
        setPlanning(r.planning);
        setCode("");
      } else {
        setError(r.message);
        setCode("");
      }
    });
  }

  function close() {
    setPlanning(null);
    setCode("");
    setError(null);
  }

  // ── Écran planning (lecture seule) ─────────────────────────────────────────
  if (planning) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <header className="bg-ink text-white px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
          <CalendarClock className="h-6 w-6 text-gold" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-gold">
              Mon planning
            </div>
            <div className="text-2xl font-bold truncate">Bonjour {planning.first_name}</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 px-5 py-3 text-base font-bold transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Fermer
          </button>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-5">
          {planning.weeks.length === 0 ? (
            <div className="text-center text-ink-3 text-lg py-16">
              Aucun planning disponible pour l&apos;instant.
            </div>
          ) : (
            planning.weeks.map((w) => (
              <section
                key={w.week_index}
                className="rounded-2xl border border-line bg-white overflow-hidden shadow-sm"
              >
                <div className="bg-surface-2 px-5 py-3 flex items-center justify-between">
                  <div className="text-lg font-bold text-ink">
                    Semaine {w.week_index + 1}
                    <span className="ml-2 text-sm font-normal text-ink-3">
                      {fmtRange(w.week_start, w.week_end)}
                    </span>
                  </div>
                  <div className="font-mono text-lg font-bold text-gold-dark">
                    {w.total_hours.toFixed(1)}h
                  </div>
                </div>
                {w.shifts.length === 0 ? (
                  <div className="px-5 py-4 text-ink-3 italic">Aucun jour travaillé cette semaine.</div>
                ) : (
                  <ul className="divide-y divide-line">
                    {w.shifts.map((s, i) => (
                      <ShiftRow key={i} shift={s} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
          <p className="text-center text-sm text-ink-3 pt-2">
            Total : <strong className="text-ink">{planning.total_hours.toFixed(1)}h</strong> sur{" "}
            {planning.weeks.length} semaine{planning.weeks.length > 1 ? "s" : ""}
          </p>
        </main>
      </div>
    );
  }

  // ── Écran code (clavier numérique) ─────────────────────────────────────────
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-gold-dark font-bold text-[11px] uppercase tracking-[0.18em]">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
            Caftan Factory
          </div>
          <h1 className="text-3xl font-bold text-ink mt-2">Mon planning</h1>
          <p className="text-ink-3 mt-1">Saisis ton code personnel</p>
        </div>

        {/* Affichage du code (masqué en points, chiffres visibles au fur et à mesure) */}
        <div className="flex items-center justify-center gap-2 h-16 mb-3">
          {code.length === 0 ? (
            <span className="text-ink-3 text-lg">— — — — —</span>
          ) : (
            <span className="font-mono text-4xl font-bold tracking-[0.35em] text-ink">
              {code}
            </span>
          )}
        </div>

        <div className="h-6 text-center mb-2">
          {error ? <span className="text-danger text-sm font-semibold">{error}</span> : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <KeyButton key={k} onClick={() => press(k)} disabled={pending}>
              {k}
            </KeyButton>
          ))}
          <KeyButton onClick={back} disabled={pending} variant="muted" aria-label="Effacer">
            <Delete className="h-7 w-7 mx-auto" />
          </KeyButton>
          <KeyButton onClick={() => press("0")} disabled={pending}>
            0
          </KeyButton>
          <KeyButton
            onClick={submit}
            disabled={pending || code.length === 0}
            variant="gold"
            aria-label="Valider"
          >
            {pending ? <Loader2 className="h-7 w-7 mx-auto animate-spin" /> : "OK"}
          </KeyButton>
        </div>

        <button
          type="button"
          onClick={clearAll}
          disabled={pending || code.length === 0}
          className="mt-4 w-full text-sm text-ink-3 hover:text-ink disabled:opacity-40"
        >
          Tout effacer
        </button>
      </div>
    </div>
  );
}

function KeyButton({
  children,
  onClick,
  disabled,
  variant = "default",
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "gold" | "muted";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "h-20 rounded-2xl text-3xl font-bold flex items-center justify-center select-none transition-colors active:scale-[0.98] disabled:opacity-40";
  const styles =
    variant === "gold"
      ? "bg-gold text-white hover:bg-gold-dark"
      : variant === "muted"
        ? "bg-surface-2 text-ink-2 hover:bg-line"
        : "bg-white border border-line text-ink hover:bg-surface-2";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

function ShiftRow({ shift }: { shift: TabletShift }) {
  return (
    <li className="px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-ink-2 w-28 shrink-0">{fmtDayLabel(shift.date)}</span>
        <span className="font-mono text-xl font-bold text-ink">
          {shift.start_time} – {shift.end_time}
        </span>
        <span className="ml-auto font-mono text-ink-3">{shift.hours.toFixed(1)}h</span>
      </div>
      {shift.pause ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-violet pl-28">
          <Coffee className="h-4 w-4" />
          Pause prière (ven.) {shift.pause.start} – {shift.pause.end}
        </div>
      ) : shift.breaks && shift.breaks.length > 0 ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-3 pl-28">
          <Coffee className="h-4 w-4" />
          Pauses : {shift.breaks.map((b) => `${b.start}–${b.end}`).join("  ·  ")}
        </div>
      ) : null}
    </li>
  );
}
