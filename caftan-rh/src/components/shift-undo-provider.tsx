"use client";
// Karim 15/05/2026 : Ctrl+Z / Cmd+Z pour annuler la derniere modif de shift.
//
// Stack en memoire (60s TTL). Chaque mutation reussie (create / update /
// move / delete) appelle `push({ label, undo })`. Le hook keyboard ecoute
// Ctrl+Z global et trigger() pop le dernier element et l execute. Le toast
// affiche "Annuler" comme action button -- meme effet sans clavier.

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { toast } from "sonner";

export type UndoEntry = {
  /** Label utilisateur ("Shift creee", "Shift deplace", ...) */
  label: string;
  /** Fonction async qui execute l undo. Retourne ok ou throw. */
  undo: () => Promise<void>;
};

type UndoCtx = {
  push: (e: UndoEntry) => void;
  trigger: () => void;
};

const UndoContext = createContext<UndoCtx | null>(null);

const TTL_MS = 60_000;

export function ShiftUndoProvider({ children }: { children: React.ReactNode }) {
  // Stack en ref pour eviter les re-renders. Chaque entree porte son timer
  // d expiration pour etre purgee si pas utilisee.
  const stackRef = useRef<Array<UndoEntry & { id: number; timer: ReturnType<typeof setTimeout> }>>([]);
  const counterRef = useRef(0);

  const trigger = useCallback(() => {
    const last = stackRef.current.pop();
    if (!last) {
      toast.info("Rien à annuler.");
      return;
    }
    clearTimeout(last.timer);
    (async () => {
      try {
        await last.undo();
        toast.success(`Annulé : ${last.label}`);
      } catch (e) {
        toast.error(`Annulation échouée : ${(e as Error).message}`);
      }
    })();
  }, []);

  const push = useCallback(
    (e: UndoEntry) => {
      const id = ++counterRef.current;
      const timer = setTimeout(() => {
        stackRef.current = stackRef.current.filter((x) => x.id !== id);
      }, TTL_MS);
      stackRef.current.push({ ...e, id, timer });
      // Toast informatif avec action Annuler
      toast.success(e.label, {
        duration: 5000,
        action: {
          label: "Annuler (Ctrl+Z)",
          onClick: () => trigger(),
        },
      });
    },
    [trigger],
  );

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // Ne pas intercepter si l user tape dans un input/textarea/contenteditable
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t?.isContentEditable ?? false)) {
        return;
      }
      const meta = ev.ctrlKey || ev.metaKey;
      if (meta && (ev.key === "z" || ev.key === "Z") && !ev.shiftKey) {
        ev.preventDefault();
        trigger();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger]);

  return (
    <UndoContext.Provider value={{ push, trigger }}>{children}</UndoContext.Provider>
  );
}

export function useShiftUndo(): UndoCtx {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    // Fallback no-op : si un composant utilise le hook sans provider, on
    // ignore plutot que de planter. Utile pendant les tests.
    return {
      push: () => undefined,
      trigger: () => undefined,
    };
  }
  return ctx;
}
