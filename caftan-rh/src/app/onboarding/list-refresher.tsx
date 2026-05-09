"use client";

import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/use-realtime";

export function OnboardingListRefresher() {
  const router = useRouter();
  useRealtime("onboarding_runs", () => router.refresh());
  useRealtime("onboarding_run_items", () => router.refresh());
  return null;
}
