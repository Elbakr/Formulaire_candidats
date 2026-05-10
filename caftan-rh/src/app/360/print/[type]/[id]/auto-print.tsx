"use client";

import { useEffect } from "react";

/** Triggers the browser's native print dialog once the page is mounted. */
export function AutoPrint() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* user can still hit Ctrl+P */
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
