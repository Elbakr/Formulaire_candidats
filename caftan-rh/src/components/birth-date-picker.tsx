"use client";

// Karim 2026-07-04 : sélecteur de DATE DE NAISSANCE en 3 listes (Jour / Mois /
// Année). L'année la PLUS RÉCENTE proposée = aujourd'hui − 17 ans (ex. 2009), donc
// 2026 n'apparaît jamais et un candidat < 17 ans ne peut pas s'inscrire.
//
// IMPORTANT : le composant garde son PROPRE état pour les 3 listes. On ne peut pas
// dériver l'affichage uniquement de la valeur ISO du parent (qui n'existe qu'une
// fois les 3 choisis) — sinon chaque sélection partielle se réinitialise et il
// devient impossible de sélectionner (bug signalé). On émet vers le parent une ISO
// complète quand les 3 sont posés, sinon "".

import { useEffect, useMemo, useState } from "react";

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function daysInMonth(year: number, month1: number): number {
  if (!year || !month1) return 31;
  return new Date(year, month1, 0).getDate();
}

function partsFromIso(v: string): { y: string; m: string; d: string } {
  if (v && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return { y: String(Number(v.slice(0, 4))), m: String(Number(v.slice(5, 7))), d: String(Number(v.slice(8, 10))) };
  }
  return { y: "", m: "", d: "" };
}

export function BirthDatePicker({
  value,
  onChange,
  maxIso,
}: {
  value: string;
  onChange: (isoOrEmpty: string) => void;
  maxIso: string;
}) {
  const maxYear = Number(maxIso.slice(0, 4)) || new Date().getFullYear() - 17;
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = maxYear; y >= maxYear - 66; y--) arr.push(y);
    return arr;
  }, [maxYear]);

  const init = partsFromIso(value);
  const [y, setY] = useState(init.y);
  const [m, setM] = useState(init.m);
  const [d, setD] = useState(init.d);

  // Émet vers le parent quand le trio change (ISO complète, ou "" si incomplet).
  useEffect(() => {
    if (y && m && d) {
      const clampedDay = Math.min(Number(d), daysInMonth(Number(y), Number(m)));
      const iso = `${y}-${String(Number(m)).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
      onChange(iso > maxIso ? "" : iso);
    } else {
      onChange("");
    }
    // onChange volontairement hors deps (nouvelle réf à chaque render du parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, d, maxIso]);

  const nbDays = daysInMonth(Number(y), Number(m));
  const days = Array.from({ length: nbDays }, (_, i) => i + 1);
  // Si le jour choisi dépasse la longueur du mois (ex. 31 puis février), on
  // réajuste l'affichage pour qu'il colle à la valeur réellement émise.
  useEffect(() => {
    if (d && Number(d) > nbDays) setD(String(nbDays));
  }, [nbDays, d]);
  const complete = !!(y && m && d);
  const tooYoung = complete
    ? `${y}-${String(Number(m)).padStart(2, "0")}-${String(Math.min(Number(d), nbDays)).padStart(2, "0")}` > maxIso
    : false;

  const sel = "rounded-lg border-[1.5px] bg-surface px-2 py-2 text-sm outline-none transition-colors " +
    (complete && !tooYoung ? "border-success" : "border-line focus:border-gold");

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Jour" className={sel} value={d} onChange={(e) => setD(e.target.value)}>
          <option value="">Jour</option>
          {days.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select aria-label="Mois" className={sel} value={m} onChange={(e) => setM(e.target.value)}>
          <option value="">Mois</option>
          {MOIS.map((nom, i) => <option key={i} value={i + 1}>{nom}</option>)}
        </select>
        <select aria-label="Année" className={sel} value={y} onChange={(e) => setY(e.target.value)}>
          <option value="">Année</option>
          {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
        </select>
      </div>
      {tooYoung ? (
        <p className="text-[11px] text-danger font-semibold mt-1">Tu dois avoir au moins 17 ans pour t&apos;enregistrer.</p>
      ) : null}
    </div>
  );
}
