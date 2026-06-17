"use client";

// Karim 2026-06-17 : auto-save générique par champ, RÉUTILISABLE par tout
// formulaire (existant ou à venir). Le bouton « Enregistrer » devient facultatif :
// chaque champ est persisté au blur/au changement, ce qui évite les oublis.
//
// Usage :
//   const save = useCallback((key, value) => maSaveAction({ [key]: value }), []);
//   const { autosave, savingKey, savedKeys } = useFieldAutosave(save);
//   <input onBlur={() => autosave("email", values.email)} ... />
//   {savingKey === "email" ? "…" : savedKeys.has("email") ? "enregistré ✓" : null}

import { useCallback, useRef, useState } from "react";

export type FieldSaveFn = (key: string, value: string) => Promise<{ ok: boolean; error?: string }>;

export function useFieldAutosave(
  save: FieldSaveFn,
  opts?: { validate?: (key: string, value: string) => boolean },
) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  // Dernière valeur sauvegardée par champ -> évite les écritures redondantes.
  const lastSaved = useRef<Record<string, string>>({});

  const autosave = useCallback(
    async (key: string, raw: string) => {
      const v = (raw ?? "").trim();
      if (!v) return;
      if (opts?.validate && !opts.validate(key, v)) return;
      if (lastSaved.current[key] === v) return; // déjà sauvegardé tel quel
      setSavingKey(key);
      try {
        const r = await save(key, v);
        if (r.ok) {
          lastSaved.current[key] = v;
          setSavedKeys((s) => new Set(s).add(key));
        }
      } catch {
        /* silencieux : la soumission finale reste le filet */
      } finally {
        setSavingKey((cur) => (cur === key ? null : cur));
      }
    },
    [save, opts],
  );

  return { autosave, savingKey, savedKeys };
}
