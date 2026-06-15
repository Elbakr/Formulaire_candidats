"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addAvailabilitySlot } from "./actions";
import type { AddAvailabilitySlotInput } from "./actions";

const DAYS_FR = [
  { value: 0, label: "Dimanche" },
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
];

type Mode = "recurring" | "specific";

export function AvailabilityForm() {
  const [mode, setMode] = useState<Mode>("recurring");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");
  const [specificDate, setSpecificDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDayOfWeek("");
    setSpecificDate("");
    setStartTime("");
    setEndTime("");
    setNote("");
    setError(null);
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const input: AddAvailabilitySlotInput = {
      day_of_week: mode === "recurring" && dayOfWeek !== "" ? parseInt(dayOfWeek, 10) : null,
      specific_date: mode === "specific" && specificDate ? specificDate : null,
      start_time: startTime,
      end_time: endTime,
      note,
    };

    startTransition(async () => {
      const res = await addAvailabilitySlot(input);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      {/* Mode : récurrent ou ponctuel */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode("recurring"); reset(); }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            mode === "recurring"
              ? "bg-gold-dark text-white border-gold-dark"
              : "border-line text-ink-2 hover:border-gold-dark hover:text-gold-dark"
          }`}
        >
          Jour récurrent
        </button>
        <button
          type="button"
          onClick={() => { setMode("specific"); reset(); }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            mode === "specific"
              ? "bg-gold-dark text-white border-gold-dark"
              : "border-line text-ink-2 hover:border-gold-dark hover:text-gold-dark"
          }`}
        >
          Date précise
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Jour de semaine ou date */}
        {mode === "recurring" ? (
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-3 uppercase tracking-wider">
              Jour de la semaine *
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              required
              className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold-dark"
            >
              <option value="">Choisir…</option>
              {DAYS_FR.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-3 uppercase tracking-wider">
              Date *
            </label>
            <input
              type="date"
              value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
              required
              min={new Date().toISOString().split("T")[0]}
              className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold-dark"
            />
          </div>
        )}

        {/* Note (sur la même rangée, colonne 2) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-ink-3 uppercase tracking-wider">
            Note (optionnel)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex : uniquement le matin"
            className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold-dark"
          />
        </div>
      </div>

      {/* Heures */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-bold text-ink-3 uppercase tracking-wider">
            Heure début *
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold-dark"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-ink-3 uppercase tracking-wider">
            Heure fin *
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold-dark"
          />
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <p className="text-sm text-danger bg-danger-light border border-danger rounded px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-success bg-success-light border border-success rounded px-3 py-2">
          Créneau ajouté.
        </p>
      )}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Ajouter ce créneau
      </Button>
    </form>
  );
}
