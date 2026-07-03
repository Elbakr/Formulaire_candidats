"use client";

// Karim 2026-07-03 : ÉTAPE 2 du formulaire candidat — le candidat déclare ses
// indisponibilités sur les 3 prochains mois (récurrentes + programmées). Objectif :
// donner au RH une base de planning solide et ne jamais forcer le candidat au-delà
// de ses disponibilités déclarées. Chaque champ est expliqué.

import { useMemo, useState, useTransition } from "react";
import { addCandidateUnavailabilityAction, deleteCandidateUnavailabilityAction } from "./unavailability-actions";

type Item = {
  id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
};

const DOW = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const REASONS: Array<{ code: string; label: string }> = [
  { code: "vacances", label: "Vacances / congé" },
  { code: "hospitalisation", label: "Hospitalisation / opération" },
  { code: "examen", label: "Examen" },
  { code: "cours", label: "Cours / école" },
  { code: "medical", label: "Rendez-vous médical" },
  { code: "perso", label: "Personnel" },
  { code: "autre", label: "Autre" },
];
function reasonLabel(code: string | null): string {
  return REASONS.find((r) => r.code === code)?.label ?? (code ?? "—");
}
function fmtDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

export function UnavailabilitiesStep({
  token,
  initialItems,
  onDone,
}: {
  token: string;
  initialItems: Item[];
  onDone?: () => void;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Récurrente (brouillon)
  const [rDow, setRDow] = useState("1");
  const [rStart, setRStart] = useState("");
  const [rEnd, setREnd] = useState("");
  const [rReason, setRReason] = useState("cours");

  // Programmée (brouillon)
  const [sDate, setSDate] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");
  const [sReason, setSReason] = useState("vacances");

  // Horizon 3 mois pour les dates programmées.
  const { todayISO, maxISO } = useMemo(() => {
    const now = new Date();
    const max = new Date(now);
    max.setMonth(max.getMonth() + 3);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { todayISO: iso(now), maxISO: iso(max) };
  }, []);

  const recurring = items.filter((i) => i.day_of_week !== null);
  const specific = items.filter((i) => i.date_specific !== null);

  function addRecurring() {
    setErr(null);
    startTransition(async () => {
      const r = await addCandidateUnavailabilityAction(token, {
        mode: "recurring",
        day_of_week: Number(rDow),
        start_time: rStart || null,
        end_time: rEnd || null,
        reason: rReason,
      });
      if (!r.ok || !r.id) { setErr(r.error ?? "Erreur"); return; }
      setItems((prev) => [...prev, { id: r.id!, day_of_week: Number(rDow), date_specific: null, start_time: rStart || null, end_time: rEnd || null, reason: rReason, notes: null }]);
      setRStart(""); setREnd("");
    });
  }

  function addSpecific() {
    setErr(null);
    if (!sDate) { setErr("Choisis une date."); return; }
    startTransition(async () => {
      const r = await addCandidateUnavailabilityAction(token, {
        mode: "specific",
        date_specific: sDate,
        start_time: sStart || null,
        end_time: sEnd || null,
        reason: sReason,
      });
      if (!r.ok || !r.id) { setErr(r.error ?? "Erreur"); return; }
      setItems((prev) => [...prev, { id: r.id!, day_of_week: null, date_specific: sDate, start_time: sStart || null, end_time: sEnd || null, reason: sReason, notes: null }]);
      setSDate(""); setSStart(""); setSEnd("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteCandidateUnavailabilityAction(token, id);
      if (r.ok) setItems((prev) => prev.filter((i) => i.id !== id));
      else setErr(r.error ?? "Erreur");
    });
  }

  const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-ink-3 mb-1";

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-bold text-ink">Étape 2 — Tes indisponibilités (3 prochains mois)</div>
        <p className="text-[13px] text-ink-2 leading-relaxed mt-1">
          Indique quand tu <b>ne peux pas</b> travailler. On construira ton planning autour de ces contraintes —
          tu ne seras jamais planifié·e sur ces créneaux. Plus c&apos;est précis, mieux on t&apos;intègre 🙏
        </p>
      </div>

      {/* ── Récurrentes ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="bg-surface-2 px-3 py-2">
          <div className="text-[13px] font-bold text-ink">🔁 Indisponibilités récurrentes</div>
          <div className="text-[11px] text-ink-3">Chaque semaine à heure fixe (cours, garde d&apos;enfant, autre job…). Laisse l&apos;heure vide = toute la journée.</div>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2 items-end">
          <div className="col-span-2">
            <label className={labelCls}>Jour de la semaine</label>
            <select className={inputCls} value={rDow} onChange={(e) => setRDow(e.target.value)}>
              {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>De (optionnel)</label>
            <input type="time" className={inputCls} value={rStart} onChange={(e) => setRStart(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>À (optionnel)</label>
            <input type="time" className={inputCls} value={rEnd} onChange={(e) => setREnd(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Motif</label>
            <select className={inputCls} value={rReason} onChange={(e) => setRReason(e.target.value)}>
              {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <button type="button" onClick={addRecurring} disabled={pending}
              className="w-full rounded-lg bg-ink text-white text-sm font-bold py-2 disabled:opacity-60">
              + Ajouter cette indispo récurrente
            </button>
          </div>
        </div>
        {recurring.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line">
            {recurring.map((u) => (
              <li key={u.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                <span className="flex-1">
                  <b>{DOW[u.day_of_week ?? 0]}</b> · {u.start_time && u.end_time ? `${u.start_time.slice(0, 5)}–${u.end_time.slice(0, 5)}` : "journée entière"}
                  <span className="text-ink-3"> · {reasonLabel(u.reason)}</span>
                </span>
                <button type="button" onClick={() => remove(u.id)} disabled={pending} className="text-danger text-xs font-bold">Retirer</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── Programmées ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="bg-surface-2 px-3 py-2">
          <div className="text-[13px] font-bold text-ink">📅 Indisponibilités programmées</div>
          <div className="text-[11px] text-ink-3">Dates précises déjà connues sur les 3 prochains mois (vacances, hospitalisation, examen…). Une date à la fois.</div>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2 items-end">
          <div className="col-span-2">
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={sDate} min={todayISO} max={maxISO} onChange={(e) => setSDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>De (optionnel)</label>
            <input type="time" className={inputCls} value={sStart} onChange={(e) => setSStart(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>À (optionnel)</label>
            <input type="time" className={inputCls} value={sEnd} onChange={(e) => setSEnd(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Motif</label>
            <select className={inputCls} value={sReason} onChange={(e) => setSReason(e.target.value)}>
              {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <button type="button" onClick={addSpecific} disabled={pending}
              className="w-full rounded-lg bg-ink text-white text-sm font-bold py-2 disabled:opacity-60">
              + Ajouter cette date
            </button>
          </div>
        </div>
        {specific.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line">
            {specific.map((u) => (
              <li key={u.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                <span className="flex-1">
                  <b>{u.date_specific ? fmtDate(u.date_specific) : "—"}</b> · {u.start_time && u.end_time ? `${u.start_time.slice(0, 5)}–${u.end_time.slice(0, 5)}` : "journée entière"}
                  <span className="text-ink-3"> · {reasonLabel(u.reason)}</span>
                </span>
                <button type="button" onClick={() => remove(u.id)} disabled={pending} className="text-danger text-xs font-bold">Retirer</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {err ? <p className="text-sm text-danger">{err}</p> : null}

      <div className="rounded-lg bg-gold-light/40 border border-gold/40 p-3 text-[12px] text-ink-2">
        Rien à déclarer ? C&apos;est parfait aussi — passe simplement à la suite. Tu pourras compléter plus tard.
      </div>

      {onDone ? (
        <button type="button" onClick={onDone} disabled={pending}
          className="w-full rounded-xl bg-gold text-[#1a1a0d] font-bold py-3 disabled:opacity-60">
          Terminer mon dossier
        </button>
      ) : null}
    </div>
  );
}
