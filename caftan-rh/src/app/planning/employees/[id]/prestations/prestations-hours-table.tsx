// Karim 2026-07-09 : VUE TABLEAU compacte des prestations.
// Objectif : voir d'un coup d'oeil TOUTES les heures de l'employe sur la periode
// (planifie vs pointe, ecart, anomalies) pour reperer vite les erreurs.
// Server component (lecture seule) : pas de "use client".
// IMPORTANT : les heures POINTEES sont des timestamptz -> on les affiche via
// fmtTime (Europe/Brussels force) pour eviter le bug -2h serveur UTC.
// Les heures PLANIFIEES (start_time/end_time) sont deja des heures murales locales.

import { AlertTriangle } from "lucide-react";
import { formatDurationMin } from "@/lib/clock";
import { fmtTime } from "@/lib/datetime";
import { parseISODate } from "@/lib/planning";

// Une ligne du tableau = un shift (ou un pointage hors planning) sur un jour.
export type PrestationTableRow = {
  iso: string;
  isOrphan: boolean; // pointage sans shift planifie
  siteCode: string | null;
  siteColor: string | null;
  plannedStart: string | null; // "10:00"
  plannedEnd: string | null; // "18:00"
  plannedMinutes: number;
  inISO: string | null; // occurred_at (timestamptz)
  outISO: string | null;
  workedMinutes: number | null;
  isAutoClosedOut: boolean;
  isLate: boolean;
  lateMinutes: number | null;
  isMissingOut: boolean;
  isAbsent: boolean;
};

const ABERRANT_MIN = 14 * 60; // > 14h = duree suspecte

// "Lun 07/07" (jour abrege capitalise + date courte), fuseau belge force.
function shortDayLabel(iso: string): string {
  const d = parseISODate(iso);
  const wd = d
    .toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels", weekday: "short" })
    .replace(".", "");
  const dm = d.toLocaleDateString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
  });
  const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
  return `${cap} ${dm}`;
}

export function PrestationsHoursTable({ rows }: { rows: PrestationTableRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-ink-3 italic">
        Aucun shift ni pointage sur la période.
      </div>
    );
  }

  let totalPlanned = 0;
  let totalWorked = 0;
  for (const r of rows) {
    totalPlanned += r.plannedMinutes;
    if (r.workedMinutes != null) totalWorked += r.workedMinutes;
  }
  const totalDiff = totalWorked - totalPlanned;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[640px]">
        <thead className="sticky top-0 z-10 bg-surface-2 text-ink-3">
          <tr className="text-left">
            <th className="px-3 py-2 font-bold whitespace-nowrap">Date</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Site</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Planifié</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Pointé</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Heures</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Écart</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Anomalie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TableRow key={`${r.iso}-${i}`} r={r} zebra={i % 2 === 1} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-surface-2 font-bold">
            <td className="px-3 py-2.5" colSpan={2}>
              Total ({rows.length} ligne{rows.length > 1 ? "s" : ""})
            </td>
            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
              {formatDurationMin(totalPlanned)}
            </td>
            <td className="px-3 py-2.5 text-ink-3">planifié</td>
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
              {formatDurationMin(totalWorked)}
            </td>
            <td
              className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
                totalDiff >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {totalDiff >= 0 ? "+" : "−"}
              {formatDurationMin(Math.abs(totalDiff))}
            </td>
            <td className="px-3 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TableRow({ r, zebra }: { r: PrestationTableRow; zebra: boolean }) {
  const aberrant = r.workedMinutes != null && r.workedMinutes > ABERRANT_MIN;
  const isError = r.isMissingOut || r.isAbsent || aberrant;
  const isWarn = r.isOrphan || r.isLate;

  // Fond : rouge leger si erreur, ambre leger si avertissement, sinon zebrage.
  const bg = isError
    ? "bg-danger/5"
    : isWarn
      ? "bg-amber-50"
      : zebra
        ? "bg-surface-2/40"
        : "";

  // Cellule "Pointé".
  let pointe: React.ReactNode;
  if (!r.inISO) {
    pointe = <span className="text-ink-3">—</span>;
  } else if (r.outISO) {
    pointe = (
      <span className={r.isAutoClosedOut ? "italic text-amber-700" : ""}>
        {fmtTime(r.inISO)}–{fmtTime(r.outISO)}
        {r.isAutoClosedOut ? "*" : ""}
      </span>
    );
  } else if (r.isMissingOut) {
    pointe = <span className="text-danger">{fmtTime(r.inISO)}–?</span>;
  } else {
    pointe = (
      <span className="text-gold-dark">
        {fmtTime(r.inISO)}– <span className="italic">en cours</span>
      </span>
    );
  }

  // Cellule "Écart".
  let ecart: React.ReactNode = <span className="text-ink-3">—</span>;
  if (r.isOrphan && r.workedMinutes != null) {
    ecart = (
      <span className="text-amber-700" title="Hors planning">
        +{formatDurationMin(r.workedMinutes)}
      </span>
    );
  } else if (r.workedMinutes != null && r.plannedMinutes > 0) {
    const diff = r.workedMinutes - r.plannedMinutes;
    const abs = Math.abs(diff);
    const tone =
      abs <= 10 ? "text-success" : abs <= 30 ? "text-amber-700" : "text-danger";
    ecart = (
      <span className={tone}>
        {diff >= 0 ? "+" : "−"}
        {formatDurationMin(abs)}
      </span>
    );
  }

  return (
    <tr className={`border-b border-line/60 ${bg}`}>
      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{shortDayLabel(r.iso)}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {r.siteCode ? (
          <span
            className="inline-flex items-center justify-center min-w-[26px] h-4 px-1 rounded text-white font-bold text-[10px]"
            style={{ backgroundColor: r.siteColor ?? "#666" }}
          >
            {r.siteCode}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
        {r.isOrphan ? (
          <span className="text-amber-700 italic">Hors planning</span>
        ) : r.plannedStart && r.plannedEnd ? (
          `${r.plannedStart}–${r.plannedEnd}`
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{pointe}</td>
      <td className="px-3 py-1.5 tabular-nums text-right whitespace-nowrap">
        {r.workedMinutes != null ? formatDurationMin(r.workedMinutes) : <span className="text-ink-3">—</span>}
      </td>
      <td className="px-3 py-1.5 tabular-nums text-right whitespace-nowrap">{ecart}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <div className="flex items-center gap-1 flex-wrap">
          {r.isAbsent ? <Marker tone="danger">Absent</Marker> : null}
          {r.isMissingOut ? <Marker tone="danger">OUT manquant</Marker> : null}
          {aberrant ? <Marker tone="danger">Durée aberrante</Marker> : null}
          {r.isOrphan ? <Marker tone="warn">Pointage sans shift</Marker> : null}
          {r.isLate && !r.isAbsent ? (
            <Marker tone="warn">
              Retard {r.lateMinutes != null ? `${Math.round(r.lateMinutes)}min` : ""}
            </Marker>
          ) : null}
          {!isError && !isWarn ? <span className="text-ink-3">—</span> : null}
        </div>
      </td>
    </tr>
  );
}

function Marker({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-danger/40 bg-danger/10 text-danger"
      : "border-amber-300 bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      <AlertTriangle className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}
