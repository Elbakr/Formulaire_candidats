"use client";

// Karim 2026-07-09 (Phase 3) : UI tablette plein écran. Écrans :
//  1) clavier numérique (gros boutons tactiles) pour saisir le code personnel ;
//  2) planning par défaut du travailleur en LECTURE SEULE ;
//  3) « Mon site du jour » : le travailleur signale à quel magasin il est
//     affecté aujourd'hui (grille des sites de SA ville). Enregistré dans une
//     table CENTRALE -> synchrone sur toutes les tablettes de tous les magasins.
//
// Karim 2026-07-10 : BILINGUE FR/NL. Le toggle de langue fait aussi office de
// sélecteur de VILLE : FR = sites Bruxelles (A,B,D,E), NL = sites Anvers (C,F).
// Thème clair uniquement. Aucune donnée interne, aucune navigation app.

import { useState, useTransition, useEffect, useCallback } from "react";
import { Delete, LogOut, Loader2, CalendarClock, Coffee, MapPin, Check, ArrowLeft, Users } from "lucide-react";
import {
  resolvePlanningByCodeAction,
  declareSiteAction,
  getSiteBoardAction,
  type TabletPlanning,
  type TabletShift,
  type TabletCity,
  type TabletSiteBoardEntry,
} from "./actions";

type Lang = "fr" | "nl";
const LANG_KEY = "tablet_lang";

const FR_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const NL_DAYS = ["zo.", "ma.", "di.", "wo.", "do.", "vr.", "za."];
const MAX_LEN = 8;

// ── i18n minimal (FR/NL) ─────────────────────────────────────────────────────
const T = {
  fr: {
    org: "Caftan Factory",
    myPlanning: "Mon planning",
    enterCode: "Saisis ton code personnel",
    hello: (n: string) => `Bonjour ${n}`,
    close: "Fermer",
    week: "Semaine",
    noWeek: "Aucun jour travaillé cette semaine.",
    noPlanning: "Aucun planning disponible pour l'instant.",
    totalOn: (h: string, n: number) => `Total : ${h}h sur ${n} semaine${n > 1 ? "s" : ""}`,
    clearAll: "Tout effacer",
    prayer: "Pause prière (ven.)",
    breaks: "Pauses",
    declareSite: "Signaler mon site du jour",
    whereToday: "Où travailles-tu aujourd'hui ?",
    today: "Aujourd'hui",
    live: "Planning en direct",
    back: "Retour",
    saved: "Enregistré",
    dayEndsAt: (t: string) => `Ta journée finit à ${t}`,
    alreadyThere: "Déjà sur place",
    nobodyYet: "Personne pour l'instant",
    saving: "Enregistrement…",
  },
  nl: {
    org: "Caftan Factory",
    myPlanning: "Mijn planning",
    enterCode: "Voer je persoonlijke code in",
    hello: (n: string) => `Hallo ${n}`,
    close: "Sluiten",
    week: "Week",
    noWeek: "Geen werkdag deze week.",
    noPlanning: "Nog geen planning beschikbaar.",
    totalOn: (h: string, n: number) => `Totaal: ${h}u over ${n} we${n > 1 ? "ken" : "ek"}`,
    clearAll: "Alles wissen",
    prayer: "Gebedspauze (vr.)",
    breaks: "Pauzes",
    declareSite: "Mijn winkel van vandaag doorgeven",
    whereToday: "Waar werk je vandaag?",
    today: "Vandaag",
    live: "Live planning",
    back: "Terug",
    saved: "Opgeslagen",
    dayEndsAt: (t: string) => `Je dag eindigt om ${t}`,
    alreadyThere: "Al aanwezig",
    nobodyYet: "Nog niemand",
    saving: "Opslaan…",
  },
} as const;

function fmtDayLabel(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const days = lang === "nl" ? NL_DAYS : FR_DAYS;
  return `${days[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
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
  const [activeCode, setActiveCode] = useState(""); // code résolu, conservé pour déclarer le site
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<TabletPlanning | null>(null);
  const [pending, start] = useTransition();

  const [lang, setLang] = useState<Lang>("fr");
  const [langChosen, setLangChosen] = useState(false); // l'utilisateur a-t-il choisi manuellement ?
  const [view, setView] = useState<"planning" | "sites">("planning");
  const [siteToday, setSiteToday] = useState<string | null>(null);

  const t = T[lang];
  const city: TabletCity = lang === "nl" ? "anvers" : "bruxelles";

  // Langue mémorisée entre sessions.
  useEffect(() => {
    const s = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
    if (s === "fr" || s === "nl") {
      setLang(s);
      setLangChosen(true);
    }
  }, []);

  function chooseLang(next: Lang) {
    setLang(next);
    setLangChosen(true);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }

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
    const used = code;
    start(async () => {
      const r = await resolvePlanningByCodeAction(used);
      if (r.ok) {
        setPlanning(r.planning);
        setActiveCode(used);
        setSiteToday(r.planning.site_today);
        setView("planning");
        // Pré-sélection de la langue via la ville du travailleur (sauf choix manuel).
        if (!langChosen) setLang(r.planning.default_city === "anvers" ? "nl" : "fr");
        setCode("");
      } else {
        setError(r.message);
        setCode("");
      }
    });
  }

  function close() {
    setPlanning(null);
    setActiveCode("");
    setSiteToday(null);
    setView("planning");
    setCode("");
    setError(null);
  }

  // ── Écran "Mon site du jour" ───────────────────────────────────────────────
  if (planning && view === "sites") {
    return (
      <SiteChooser
        lang={lang}
        city={city}
        code={activeCode}
        current={siteToday}
        onChangeLang={chooseLang}
        onDeclared={(siteCode) => setSiteToday(siteCode)}
        onBack={() => setView("planning")}
      />
    );
  }

  // ── Écran planning (lecture seule) ─────────────────────────────────────────
  if (planning) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <header className="bg-ink text-white px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
          <CalendarClock className="h-6 w-6 text-gold" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-gold flex items-center gap-2">
              {t.myPlanning}
              {planning.mode === "auto_shift" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t.live}
                </span>
              ) : null}
            </div>
            <div className="text-2xl font-bold truncate">{t.hello(planning.first_name)}</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 px-5 py-3 text-base font-bold transition-colors"
          >
            <LogOut className="h-5 w-5" />
            {t.close}
          </button>
        </header>

        {/* Barre "site du jour" : signaler / rappel du site déjà signalé */}
        <div className="bg-white border-b border-line px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView("sites")}
              className="inline-flex items-center gap-2 rounded-xl bg-gold text-white hover:bg-gold-dark active:scale-[0.99] px-4 py-3 text-base font-bold transition-colors"
            >
              <MapPin className="h-5 w-5" />
              {t.declareSite}
            </button>
            {siteToday ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                {t.today} : <strong>{siteToday}</strong>
              </span>
            ) : null}
          </div>
        </div>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-5">
          {planning.weeks.length === 0 ? (
            <div className="text-center text-ink-3 text-lg py-16">{t.noPlanning}</div>
          ) : (
            planning.weeks.map((w) => (
              <section
                key={w.week_index}
                className="rounded-2xl border border-line bg-white overflow-hidden shadow-sm"
              >
                <div className="bg-surface-2 px-5 py-3 flex items-center justify-between">
                  <div className="text-lg font-bold text-ink">
                    {t.week} {w.week_index + 1}
                    <span className="ml-2 text-sm font-normal text-ink-3">
                      {fmtRange(w.week_start, w.week_end)}
                    </span>
                  </div>
                  <div className="font-mono text-lg font-bold text-gold-dark">
                    {w.total_hours.toFixed(1)}h
                  </div>
                </div>
                {w.shifts.length === 0 ? (
                  <div className="px-5 py-4 text-ink-3 italic">{t.noWeek}</div>
                ) : (
                  <ul className="divide-y divide-line">
                    {w.shifts.map((s, i) => (
                      <ShiftRow key={i} shift={s} lang={lang} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
          <p className="text-center text-sm text-ink-3 pt-2">
            {t.totalOn(planning.total_hours.toFixed(1), planning.weeks.length)}
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
        <div className="flex justify-center mb-4">
          <LangToggle lang={lang} onChange={chooseLang} />
        </div>
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-gold-dark font-bold text-[11px] uppercase tracking-[0.18em]">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
            {t.org}
          </div>
          <h1 className="text-3xl font-bold text-ink mt-2">{t.myPlanning}</h1>
          <p className="text-ink-3 mt-1">{t.enterCode}</p>
        </div>

        <div className="flex items-center justify-center gap-2 h-16 mb-3">
          {code.length === 0 ? (
            <span className="text-ink-3 text-lg">— — — — —</span>
          ) : (
            <span className="font-mono text-4xl font-bold tracking-[0.35em] text-ink">{code}</span>
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
          {t.clearAll}
        </button>
      </div>
    </div>
  );
}

// ── Sélecteur de site (grille + tableau live) ────────────────────────────────
function SiteChooser({
  lang,
  city,
  code,
  current,
  onChangeLang,
  onDeclared,
  onBack,
}: {
  lang: Lang;
  city: TabletCity;
  code: string;
  current: string | null;
  onChangeLang: (l: Lang) => void;
  onDeclared: (siteCode: string) => void;
  onBack: () => void;
}) {
  const t = T[lang];
  const [board, setBoard] = useState<TabletSiteBoardEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(current);
  const [closing, setClosing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // code en cours d'enregistrement
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const b = await getSiteBoardAction(city);
    setBoard(b);
  }, [city]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function declare(siteCode: string) {
    if (saving) return;
    setErr(null);
    setSaving(siteCode);
    const r = await declareSiteAction(code, siteCode);
    setSaving(null);
    if (r.ok) {
      setSelected(r.site_code);
      setClosing(r.closing_time);
      onDeclared(r.site_code);
      refresh();
    } else {
      setErr(r.message);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="bg-ink text-white px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 px-4 py-2.5 text-base font-bold transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          {t.back}
        </button>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-gold flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {t.today}
          </div>
          <div className="text-xl font-bold truncate">{t.whereToday}</div>
        </div>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={onChangeLang} />
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        {selected && closing ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-600 text-white grid place-items-center shrink-0">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-emerald-800">
                {t.saved} — <strong>{selected}</strong>
              </div>
              <div className="text-sm text-emerald-700">{t.dayEndsAt(closing)}</div>
            </div>
          </div>
        ) : null}

        {err ? (
          <div className="mb-4 text-center text-danger text-sm font-semibold">{err}</div>
        ) : null}

        {board === null ? (
          <div className="py-16 text-center text-ink-3">
            <Loader2 className="h-8 w-8 mx-auto animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {board.map((s) => {
              const isSel = selected === s.code;
              const isSaving = saving === s.code;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => declare(s.code)}
                  disabled={!!saving}
                  className={`text-left rounded-2xl border-2 p-4 transition-colors active:scale-[0.99] disabled:opacity-60 ${
                    isSel
                      ? "border-gold bg-gold/10"
                      : "border-line bg-white hover:border-gold/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-14 w-14 rounded-2xl grid place-items-center text-2xl font-black shrink-0 ${
                        isSel ? "bg-gold text-white" : "bg-surface-2 text-ink"
                      }`}
                    >
                      {isSaving ? <Loader2 className="h-7 w-7 animate-spin" /> : s.code}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-ink truncate">{s.name}</div>
                      <div className="text-xs text-ink-3 flex items-center gap-1 mt-0.5">
                        <Users className="h-3.5 w-3.5" />
                        {s.people.length > 0
                          ? `${s.people.length} · ${t.alreadyThere}`
                          : t.nobodyYet}
                      </div>
                    </div>
                    {isSel ? <Check className="h-6 w-6 text-gold ml-auto shrink-0" /> : null}
                  </div>
                  {s.people.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.people.map((p, i) => (
                        <span
                          key={i}
                          className="inline-block rounded-full bg-surface-2 text-ink-2 text-xs font-medium px-2 py-0.5"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function LangToggle({
  lang,
  onChange,
  readOnlyCity = false,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
  readOnlyCity?: boolean;
}) {
  return (
    <div className="inline-flex rounded-full border border-line bg-white p-1">
      {(["fr", "nl"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => !readOnlyCity && onChange(l)}
          disabled={readOnlyCity}
          className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase transition-colors ${
            lang === l ? "bg-ink text-white" : "text-ink-3 hover:text-ink"
          } ${readOnlyCity ? "cursor-default" : ""}`}
        >
          {l}
        </button>
      ))}
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

function ShiftRow({ shift, lang }: { shift: TabletShift; lang: Lang }) {
  const t = T[lang];
  return (
    <li className={`px-5 py-3 ${shift.is_today ? "bg-gold-light/60 border-l-4 border-gold" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`font-semibold w-28 shrink-0 ${shift.is_today ? "text-gold-dark" : "text-ink-2"}`}>
          {shift.is_today ? (
            <span className="inline-block rounded-full bg-gold text-white text-[9px] font-bold uppercase px-1.5 py-0.5 mr-1 align-middle">
              {t.today}
            </span>
          ) : null}
          {fmtDayLabel(shift.date, lang)}
        </span>
        <span className="font-mono text-xl font-bold text-ink">
          {shift.start_time} – {shift.end_time}
        </span>
        {shift.site ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3">
            <MapPin className="h-3.5 w-3.5" />
            {shift.site}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-ink-3">{shift.hours.toFixed(1)}h</span>
      </div>
      {shift.pause ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-violet pl-28">
          <Coffee className="h-4 w-4" />
          {t.prayer} {shift.pause.start} – {shift.pause.end}
        </div>
      ) : shift.breaks && shift.breaks.length > 0 ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-3 pl-28">
          <Coffee className="h-4 w-4" />
          {t.breaks} : {shift.breaks.map((b) => `${b.start}–${b.end}`).join("  ·  ")}
        </div>
      ) : null}
    </li>
  );
}
