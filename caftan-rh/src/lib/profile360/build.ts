// Server-only data aggregator for the 360° profile view.
//
// `buildCandidate360(applicationId)` and `buildEmployee360(employeeId)`
// run a parallel batch of Supabase queries and return a denormalised
// payload suited for the /360 routes. Anything missing comes back as
// `null` (no profile yet, no shifts, no scoring, etc) so the page can
// render gracefully.
//
// All optional/extension tables are wrapped in `try/catch` and fall back
// to empty arrays — this lets us run against partially-migrated DBs.

import { createClient } from "@/lib/supabase/server";

const HARD_LIMIT = 100;

// ──────────────────────────────────────────────────────────────────
// Shared shapes
// ──────────────────────────────────────────────────────────────────

export type Candidate360Row = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality: string | null;
  nrn: string | null;
  cin_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;
  bic: string | null;
  bank_holder: string | null;
  transport_type: string | null;
  transport_subscription: string | null;
  transport_price: string | null;
  distance_km: number | null;
  langs: Record<string, string> | null;
  wanted_contract_type: string | null;
  work_time_pref: string | null;
  available_from: string | null;
  motivation?: string | null;
  applied_at: string | null;
  raw_payload: Record<string, unknown> | null;
  source: string | null;
  created_at: string | null;
};

export type Employee360Row = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department_id: string | null;
  department: { id: string; name: string } | null;
  manager_id: string | null;
  contract_type: string | null;
  weekly_hours: number | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  trial_end_date: string | null;
  annual_hours_budget: number | null;
  status: "active" | "on_leave" | "archived" | string;
  cin_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_holder: string | null;
  nrn: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  birth_date: string | null;
  langs: Record<string, string> | null;
  notes_admin: string | null;
};

export type DocRow = {
  id: string;
  file_name: string;
  kind: string | null;
  catalog_slug: string | null;
  validation_status: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  subject: string | null;
  body: string;
  direction: "outbound" | "inbound";
  created_at: string;
  sender: { id: string; full_name: string | null } | null;
};

export type AnomalyRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  target_type: string;
  target_id: string | null;
  title: string;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
};

export type ShiftRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  status: string;
  site_id: string | null;
  notes: string | null;
};

export type EvaluationRow = {
  id: string;
  period_start: string;
  period_end: string;
  scores: Record<string, number> | null;
  total: number | null;
  comment: string | null;
  created_at: string;
  evaluator: { full_name: string | null } | null;
};

export type EmployeeMetrics = {
  reliability_pct: number | null;
  coverage_pct: number | null;
  shifts_total: number | null;
  shifts_done: number | null;
  shifts_no_show: number | null;
  time_off_days_12m: number | null;
  avg_manager_score: number | null;
  global_score: number | null;
} | null;

export type OnboardingState = {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  done: number;
  total: number;
  pct: number;
  pendingItems: Array<{ id: string; label: string; category: string | null; is_required: boolean }>;
} | null;

export type ActivityEntry = {
  id: string;
  kind: string | null;
  description: string | null;
  actor_label: string | null;
  created_at: string;
  data: Record<string, unknown> | null;
};

export type TimeOffRow = {
  id: string;
  kind: string | null;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  decided_at: string | null;
};

// ──────────────────────────────────────────────────────────────────
// Candidate 360
// ──────────────────────────────────────────────────────────────────

export type Candidate360 = {
  application: {
    id: string;
    status: string;
    rating: number | null;
    motivation: string | null;
    created_at: string;
    updated_at: string;
    job: { id: string; title: string | null; location: string | null; contract_type: string | null } | null;
  };
  candidate: Candidate360Row;
  /** If the candidate ended up being hired, the matching employee.id */
  employeeId: string | null;
  documents: DocRow[];
  messages: MessageRow[];
  anomalies: AnomalyRow[];
};

export async function buildCandidate360(applicationId: string): Promise<Candidate360 | null> {
  const supabase = await createClient();

  const { data: appRow } = await supabase
    .from("applications")
    .select(
      `id, status, rating, motivation, created_at, updated_at,
       candidate:candidates(*),
       job:jobs(id, title, location, contract_type)`,
    )
    .eq("id", applicationId)
    .single();

  if (!appRow) return null;
  const app = appRow as unknown as {
    id: string;
    status: string;
    rating: number | null;
    motivation: string | null;
    created_at: string;
    updated_at: string;
    candidate: Candidate360Row;
    job: Candidate360["application"]["job"];
  };

  const candidate = app.candidate;

  // Documents (linked via application_id OR candidate_id when available)
  const docFilter = candidate?.id
    ? `application_id.eq.${applicationId},candidate_id.eq.${candidate.id}`
    : `application_id.eq.${applicationId}`;
  const [docsRes, msgsRes] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, file_name, kind, catalog_slug, validation_status, storage_path, mime_type, size_bytes, created_at",
      )
      .or(docFilter)
      .order("created_at", { ascending: false })
      .limit(HARD_LIMIT),
    supabase
      .from("messages")
      .select("id, subject, body, direction, created_at, sender:profiles(id, full_name)")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Anomalies (optional table)
  let anomalies: AnomalyRow[] = [];
  try {
    const { data, error } = await supabase
      .from("anomaly_flags" as never)
      .select("id, kind, severity, target_type, target_id, title, description, detected_at, resolved_at")
      .eq("target_type", "application")
      .eq("target_id", applicationId)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(20);
    if (!error && data) anomalies = data as unknown as AnomalyRow[];
  } catch {
    /* table not yet migrated */
  }

  // Find linked employee by email (best-effort — schema doesn't carry an FK)
  let employeeId: string | null = null;
  if (candidate?.email) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("email", candidate.email)
      .maybeSingle();
    if (emp?.id) employeeId = (emp as { id: string }).id;
  }

  return {
    application: {
      id: app.id,
      status: app.status,
      rating: app.rating,
      motivation: app.motivation,
      created_at: app.created_at,
      updated_at: app.updated_at,
      job: app.job,
    },
    candidate,
    employeeId,
    documents: ((docsRes.data ?? []) as unknown as DocRow[]),
    messages: ((msgsRes.data ?? []) as unknown as MessageRow[]),
    anomalies,
  };
}

// ──────────────────────────────────────────────────────────────────
// Employee 360
// ──────────────────────────────────────────────────────────────────

export type Employee360 = {
  employee: Employee360Row;
  /** If this employee originated from an application, link back */
  applicationId: string | null;
  metrics: EmployeeMetrics;
  onboarding: OnboardingState;
  shifts: ShiftRow[];
  timeOff: TimeOffRow[];
  evaluations: EvaluationRow[];
  documents: DocRow[];
  messages: MessageRow[];
  anomalies: AnomalyRow[];
  activity: ActivityEntry[];
};

export async function buildEmployee360(employeeId: string): Promise<Employee360 | null> {
  const supabase = await createClient();

  const { data: empRow } = await supabase
    .from("employees")
    .select("*, department:departments(id, name)")
    .eq("id", employeeId)
    .single();
  if (!empRow) return null;
  const employee = empRow as unknown as Employee360Row;

  // Compute window for shifts (this week + next 4 weeks => 35 days)
  const today = new Date();
  const start = new Date(today);
  // Monday of current week
  const dow = start.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 35);

  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  // Linked application (best-effort by email)
  let applicationId: string | null = null;
  if (employee.email) {
    const { data: candidates } = await supabase
      .from("candidates")
      .select("id")
      .eq("email", employee.email)
      .limit(1);
    const candId = (candidates as Array<{ id: string }> | null)?.[0]?.id;
    if (candId) {
      const { data: apps } = await supabase
        .from("applications")
        .select("id, created_at")
        .eq("candidate_id", candId)
        .order("created_at", { ascending: false })
        .limit(1);
      const a = (apps as Array<{ id: string }> | null)?.[0];
      if (a) applicationId = a.id;
    }
  }

  // Parallel queries — anything missing → null/empty
  const [shiftsRes, timeOffRes, evalsRes, docsRes, msgsRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, status, site_id, notes")
      .eq("employee_id", employeeId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true })
      .limit(HARD_LIMIT),
    supabase
      .from("time_off_requests")
      .select("id, kind, start_date, end_date, status, reason, decided_at")
      .eq("employee_id", employeeId)
      .order("start_date", { ascending: false })
      .limit(20),
    supabase
      .from("evaluations")
      .select(
        "id, period_start, period_end, scores, total, comment, created_at, evaluator:profiles(full_name)",
      )
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(10),
    applicationId
      ? supabase
          .from("documents")
          .select(
            "id, file_name, kind, catalog_slug, validation_status, storage_path, mime_type, size_bytes, created_at",
          )
          .or(`employee_id.eq.${employeeId},application_id.eq.${applicationId}`)
          .order("created_at", { ascending: false })
          .limit(HARD_LIMIT)
      : supabase
          .from("documents")
          .select(
            "id, file_name, kind, catalog_slug, validation_status, storage_path, mime_type, size_bytes, created_at",
          )
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(HARD_LIMIT),
    applicationId
      ? supabase
          .from("messages")
          .select("id, subject, body, direction, created_at, sender:profiles(id, full_name)")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as MessageRow[] } as unknown as { data: MessageRow[] }),
  ]);

  // Metrics from employee_metrics view (optional)
  let metrics: EmployeeMetrics = null;
  try {
    const { data, error } = await supabase
      .from("employee_metrics" as never)
      .select(
        "reliability_pct, coverage_pct, shifts_total, shifts_done, shifts_no_show, time_off_days_12m, avg_manager_score, global_score",
      )
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!error && data) {
      metrics = data as unknown as EmployeeMetrics;
    } else {
      // Try aggregated `employee_scores` view as a fallback
      const { data: s } = await supabase
        .from("employee_scores" as never)
        .select(
          "reliability_pct, coverage_pct, shifts_total, shifts_done, shifts_no_show, time_off_days_12m, avg_manager_score, global_score",
        )
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (s) metrics = s as unknown as EmployeeMetrics;
    }
  } catch {
    /* view not yet migrated */
  }

  // Onboarding
  let onboarding: OnboardingState = null;
  try {
    const { data: runData } = await supabase
      .from("onboarding_runs")
      .select("id, started_at, completed_at")
      .eq("employee_id", employeeId)
      .maybeSingle();
    const run = runData as unknown as { id: string; started_at: string; completed_at: string | null } | null;
    if (run) {
      const { data: itemsData } = await supabase
        .from("onboarding_run_items")
        .select("id, label, category, is_required, done_at, position")
        .eq("run_id", run.id)
        .order("position");
      const items = (itemsData ?? []) as unknown as Array<{
        id: string;
        label: string;
        category: string | null;
        is_required: boolean;
        done_at: string | null;
        position: number;
      }>;
      const total = items.length;
      const done = items.filter((i) => i.done_at).length;
      const pendingItems = items
        .filter((i) => !i.done_at)
        .slice(0, 5)
        .map(({ id, label, category, is_required }) => ({ id, label, category, is_required }));
      onboarding = {
        run_id: run.id,
        started_at: run.started_at,
        completed_at: run.completed_at,
        done,
        total,
        pct: total === 0 ? 0 : Math.round((done / total) * 100),
        pendingItems,
      };
    }
  } catch {
    /* tables not yet migrated */
  }

  // Anomalies
  let anomalies: AnomalyRow[] = [];
  try {
    const { data, error } = await supabase
      .from("anomaly_flags" as never)
      .select("id, kind, severity, target_type, target_id, title, description, detected_at, resolved_at")
      .eq("target_type", "employee")
      .eq("target_id", employeeId)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(20);
    if (!error && data) anomalies = data as unknown as AnomalyRow[];
  } catch {
    /* table not yet migrated */
  }

  // Activity log (optional)
  let activity: ActivityEntry[] = [];
  try {
    const { data, error } = await supabase
      .from("activity_log" as never)
      .select("id, kind, description, actor_label, created_at, data")
      .eq("target_type", "employee")
      .eq("target_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(HARD_LIMIT);
    if (!error && data) activity = data as unknown as ActivityEntry[];
  } catch {
    /* table not yet migrated */
  }

  return {
    employee,
    applicationId,
    metrics,
    onboarding,
    shifts: ((shiftsRes.data ?? []) as unknown as ShiftRow[]),
    timeOff: ((timeOffRes.data ?? []) as unknown as TimeOffRow[]),
    evaluations: ((evalsRes.data ?? []) as unknown as EvaluationRow[]),
    documents: ((docsRes.data ?? []) as unknown as DocRow[]),
    messages: ((msgsRes.data ?? []) as unknown as MessageRow[]),
    anomalies,
    activity,
  };
}
