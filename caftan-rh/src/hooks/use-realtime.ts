"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type RealtimeTable =
  | "applications"
  | "interviews"
  | "notes"
  | "messages"
  | "shifts"
  | "time_off_requests"
  | "employees"
  | "notifications"
  | "clock_entries"
  | "evaluations"
  | "employee_metrics";

export function useRealtime(table: RealtimeTable, onChange: () => void, filter?: string) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(`realtime-${table}-${filter ?? "all"}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          () => onChangeRef.current(),
        )
        .subscribe();
    } catch {
      /* env not configured */
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [table, filter]);
}
