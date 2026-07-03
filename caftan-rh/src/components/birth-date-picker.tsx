"use client";

// Karim 2026-07-03 : sélecteur de DATE DE NAISSANCE en 3 listes (Jour / Mois /
// Année). L'année la PLUS RÉCENTE proposée = aujourd'hui − 17 ans (ex. 2009), donc
// 2026 n'apparaît jamais et un candidat < 17 ans ne peut pas s'inscrire. La borne
// exacte "jour pour jour" (aujourd'hui − 17 ans) est appliquée en plus : les combos
// > maxIso sont refusées.

import { useMemo } from "react";

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function daysInMonth(year: number, month1: number): number {
  if (!year || !month1) return 31;
  return new Date(year, month1, 0).getDate(); // month1 = 1..12 -> jour 0 du mois suivant
}

export function BirthDatePicker({
  value,
  onChange,
  maxIso,
}: {
  value: string; // "YYYY-MM-DD" ou ""
  onChange: (isoOrEmpty: string) => void; // ISO complète quand les 3 sont choisis, sinon ""
  maxIso: string; // aujourd'hui − 17 ans (YYYY-MM-DD)
}) {
  const maxYear = Number(maxIso.slice(0, 4)) || new Date().getFullYear() - 17;
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = maxYear; y >= maxYear - 66; y--) arr.push(y); // ~17 à 83 ans
    return arr;
  }, [maxYear]);

  const [yy, mm, dd] = value ? value.split("-") : ["", "", ""];
  const y = yy ? Number(yy) : 0;
  const m = mm ? Number(mm) : 0;
  const d = dd ? Number(dd) : 0;

  const nbDays = daysInMonth(y, m);
  const days = Array.from({ length: nbDays }, (_, i) => i + 1);

  function emit(ny: number, nm: number, nd: number) {
    if (ny && nm && nd) {
      const clampedDay = Math.min(nd, daysInMonth(ny, nm));
      const iso = `${ny}-${String(nm).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
      // Borne exacte 17 ans jour pour jour.
      onChange(iso > maxIso ? "" : iso);
    } else {
      onChange("");
    }
  }

  const sel = "rounded-lg border-[1.5px] bg-surface px-2 py-2 text-sm outline-none transition-colors " +
    (value ? "border-success" : "border-line focus:border-gold");

  const tooYoung = y && m && d ? `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, nbDays)).padStart(2, "0")}` > maxIso : false;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Jour" className={sel} value={d || ""} onChange={(e) => emit(y, m, Number(e.target.value))}>
          <option value="" disabled>Jour</option>
          {days.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select aria-label="Mois" className={sel} value={m || ""} onChange={(e) => emit(y, Number(e.target.value), d)}>
          <option value="" disabled>Mois</option>
          {MOIS.map((nom, i) => <option key={i} value={i + 1}>{nom}</option>)}
        </select>
        <select aria-label="Année" className={sel} value={y || ""} onChange={(e) => emit(Number(e.target.value), m, d)}>
          <option value="" disabled>Année</option>
          {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
        </select>
      </div>
      {tooYoung ? (
        <p className="text-[11px] text-danger font-semibold mt-1">Tu dois avoir au moins 17 ans pour t&apos;enregistrer.</p>
      ) : null}
    </div>
  );
}
