"use client";

import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/use-realtime";

/**
 * Lightweight wrapper that triggers a router refresh whenever a
 * `anomaly_flags` event is published over Supabase realtime. This keeps the
 * server-rendered list in sync without managing local state.
 */
export function AnomaliesRealtime() {
  const router = useRouter();
  useRealtime("anomaly_flags", () => router.refresh());
  return null;
}
