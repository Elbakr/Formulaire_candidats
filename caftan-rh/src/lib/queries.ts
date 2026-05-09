import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/types/database.types";

export type ApplicationListItem = {
  id: string;
  status: ApplicationStatus;
  rating: number | null;
  motivation: string | null;
  created_at: string;
  updated_at: string;
  candidate: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    city: string | null;
    applied_at: string;
    source: string | null;
  };
  job: { id: string; title: string } | null;
  assigned_manager_profile: { id: string; full_name: string | null } | null;
};

export async function fetchApplications(opts?: {
  status?: ApplicationStatus;
  managerId?: string;
  candidateProfileId?: string;
  limit?: number;
  /** ISO date YYYY-MM-DD inclusive */
  appliedFrom?: string;
  /** ISO date YYYY-MM-DD inclusive */
  appliedTo?: string;
}): Promise<ApplicationListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("applications")
    .select(
      `id, status, rating, motivation, created_at, updated_at,
       candidate:candidates(id, full_name, email, phone, city, profile_id, applied_at, source),
       job:jobs(id, title),
       assigned_manager_profile:profiles!applications_assigned_manager_fkey(id, full_name)`,
    )
    .order("applied_at", { ascending: false, foreignTable: "candidates" });

  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.managerId) query = query.eq("assigned_manager", opts.managerId);
  if (opts?.candidateProfileId)
    query = query.eq("candidate.profile_id", opts.candidateProfileId);
  if (opts?.appliedFrom) query = query.gte("candidate.applied_at", `${opts.appliedFrom}T00:00:00`);
  if (opts?.appliedTo) query = query.lte("candidate.applied_at", `${opts.appliedTo}T23:59:59`);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) {
    console.error("fetchApplications:", error.message);
    return [];
  }
  return (data ?? []) as unknown as ApplicationListItem[];
}

export async function fetchPipelineCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("status", { count: "exact" });
  if (error) return {} as Record<ApplicationStatus, number>;
  const out: Partial<Record<ApplicationStatus, number>> = {};
  (data ?? []).forEach((row) => {
    out[row.status as ApplicationStatus] = (out[row.status as ApplicationStatus] ?? 0) + 1;
  });
  return out;
}

export async function fetchOpenJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, title, location, contract_type, department:departments(name)")
    .eq("is_open", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}
