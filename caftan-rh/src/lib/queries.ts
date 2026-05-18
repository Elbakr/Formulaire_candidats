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
    // Smart Filter Drawer fields
    birth_date: string | null;
    nrn: string | null;
    distance_km: number | null;
    wanted_contract_type: string | null;
    langs: Record<string, string> | null;
    raw_payload: Record<string, unknown> | null;
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
  // Karim 18/05 : .range(0, 4999) avec .order(foreignTable) NE fonctionne PAS
  // sur Supabase -- le cap 1000 reste applique en silence. Symptome :
  // sur 1829 applications, seulement 1000 retournees, date max visible = 9 mai
  // (= grand batch GF). Les candidats post-9 mai jamais affiches.
  // Fix : pagination en boucle + tri sur applications.created_at (primary
  // table -- range fonctionne correctement, et tri foreignTable est de
  // toute facon fragile dans Supabase).
  const PAGE = 1000;
  const targetMax = opts?.limit ?? 5000;
  const all: ApplicationListItem[] = [];
  for (let offset = 0; offset < targetMax; offset += PAGE) {
    let query = supabase
      .from("applications")
      .select(
        `id, status, rating, motivation, created_at, updated_at,
         candidate:candidates(id, full_name, email, phone, city, profile_id, applied_at, source,
           birth_date, nrn, distance_km, wanted_contract_type, langs, raw_payload),
         job:jobs(id, title),
         assigned_manager_profile:profiles!applications_assigned_manager_fkey(id, full_name)`,
      )
      .order("created_at", { ascending: false });

    if (opts?.status) query = query.eq("status", opts.status);
    if (opts?.managerId) query = query.eq("assigned_manager", opts.managerId);
    if (opts?.candidateProfileId)
      query = query.eq("candidate.profile_id", opts.candidateProfileId);
    if (opts?.appliedFrom) query = query.gte("candidate.applied_at", `${opts.appliedFrom}T00:00:00`);
    if (opts?.appliedTo) query = query.lte("candidate.applied_at", `${opts.appliedTo}T23:59:59`);
    const upper = Math.min(offset + PAGE - 1, targetMax - 1);
    query = query.range(offset, upper);

    const { data, error } = await query;
    if (error) {
      console.error("fetchApplications page", offset, ":", error.message);
      break;
    }
    const rows = (data ?? []) as unknown as ApplicationListItem[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
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
