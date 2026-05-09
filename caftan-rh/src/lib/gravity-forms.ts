// Gravity Forms WordPress REST API client
// Doc: https://docs.gravityforms.com/rest-api-v2/

export type GFFieldMap = {
  firstname?: string;
  lastname?: string;
  birthdate?: string;
  email?: string;
  phone?: string;
  cv_url?: string;
  available_from?: string;
  worktime?: string;
  role?: string;
  city?: string;
  days_prefix?: string; // e.g. "11" → 11.1..11.7 = Lundi..Dimanche
};

export type GFSettings = {
  wp_url: string;
  ck: string;
  cs: string;
  form_id: number;
  field_map: GFFieldMap;
};

type GFEntry = Record<string, unknown> & {
  id: string | number;
  form_id?: string | number;
  date_created?: string;
  ip?: string;
  source_url?: string;
  user_agent?: string;
};

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CV_FALLBACK_KEYS = ["7", "9", "15", "16", "17", "18", "cv", "cv_url", "cv_link", "CV"];

function getField(e: GFEntry, key: string | undefined): string {
  if (!key) return "";
  const v = e[key];
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function findCvUrl(e: GFEntry): string | null {
  for (const k of CV_FALLBACK_KEYS) {
    const v = e[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v) && v.length > 10) return v;
  }
  return null;
}

function parseDays(e: GFEntry, prefix?: string): { dispoLabel: string; nbDays: number } {
  if (!prefix) return { dispoLabel: "", nbDays: 0 };
  const labels: string[] = [];
  for (let i = 1; i <= 7; i++) {
    if (e[`${prefix}.${i}`]) labels.push(DAY_LABELS[i - 1]);
  }
  return { dispoLabel: labels.join(", "), nbDays: labels.length };
}

export type MappedCandidate = {
  gf_entry_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  city: string | null;
  source: string;
  raw_payload: Record<string, unknown>;
  motivation: string | null;
  cv_url: string | null;
};

export function mapGFEntry(entry: GFEntry, fieldMap: GFFieldMap): MappedCandidate | null {
  const firstname = getField(entry, fieldMap.firstname);
  const lastname = getField(entry, fieldMap.lastname);
  const email = getField(entry, fieldMap.email).toLowerCase();
  const fullName = `${firstname} ${lastname}`.trim();

  if (!email || !fullName) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const birthRaw = getField(entry, fieldMap.birthdate);
  const birthDate = birthRaw && /^\d{4}-\d{2}-\d{2}/.test(birthRaw) ? birthRaw.slice(0, 10) : null;

  const cityRaw = getField(entry, fieldMap.city);
  // city peut être "City | Site"
  const city = cityRaw.includes("|") ? cityRaw.split("|")[0].trim() : cityRaw || null;

  const { dispoLabel } = parseDays(entry, fieldMap.days_prefix);
  const worktime = getField(entry, fieldMap.worktime);
  const role = getField(entry, fieldMap.role);
  const availableFrom = getField(entry, fieldMap.available_from);

  const motivationParts = [
    role && `Poste demandé : ${role}`,
    worktime && `Disponibilité : ${worktime}`,
    dispoLabel && `Jours dispo : ${dispoLabel}`,
    availableFrom && `Date dispo : ${availableFrom}`,
  ].filter(Boolean);

  return {
    gf_entry_id: String(entry.id),
    email,
    full_name: fullName,
    phone: getField(entry, fieldMap.phone) || null,
    birth_date: birthDate,
    city,
    source: "gravity_forms",
    motivation: motivationParts.length ? motivationParts.join("\n") : null,
    cv_url: findCvUrl(entry),
    raw_payload: {
      gf_id: entry.id,
      form_id: entry.form_id,
      date_created: entry.date_created,
      ip: entry.ip,
      source_url: entry.source_url,
      user_agent: entry.user_agent,
    },
  };
}

export async function fetchGFPage(
  settings: GFSettings,
  page: number,
  pageSize = 200,
): Promise<{ entries: GFEntry[]; total: number }> {
  const auth = Buffer.from(`${settings.ck}:${settings.cs}`).toString("base64");
  const url = `${settings.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${settings.form_id}&paging[page_size]=${pageSize}&paging[current_page]=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GF API HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { entries?: GFEntry[]; total_count?: string | number };
  const entries = Array.isArray(json.entries) ? json.entries : [];
  const total = Number(json.total_count ?? entries.length) || entries.length;
  return { entries, total };
}

export async function fetchAllGFEntries(settings: GFSettings, pageSize = 200): Promise<GFEntry[]> {
  let all: GFEntry[] = [];
  let page = 1;
  while (true) {
    const { entries, total } = await fetchGFPage(settings, page, pageSize);
    all = all.concat(entries);
    if (entries.length < pageSize || all.length >= total) break;
    page += 1;
    if (page > 50) break; // safety cap (10 000 entries max)
  }
  return all;
}

/**
 * Sync result. Run via the admin client (service-role) so RLS isn't a concern.
 */
export type SyncStats = {
  fetched: number;
  created: number;
  skipped_existing: number;
  skipped_invalid: number;
  errors: string[];
};

export async function syncGravityForms(
  settings: GFSettings,
  supabase: {
    from: (table: string) => {
      select: (sel: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { gf_entry_id: string }[] | null; error: { message: string } | null }>;
      };
      insert: (rows: Record<string, unknown>[]) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  },
): Promise<SyncStats> {
  const stats: SyncStats = { fetched: 0, created: 0, skipped_existing: 0, skipped_invalid: 0, errors: [] };

  let entries: GFEntry[];
  try {
    entries = await fetchAllGFEntries(settings);
    stats.fetched = entries.length;
  } catch (e) {
    stats.errors.push(`Fetch: ${(e as Error).message}`);
    return stats;
  }

  // Map + filter invalid
  const mapped: MappedCandidate[] = [];
  for (const entry of entries) {
    const m = mapGFEntry(entry, settings.field_map);
    if (m) mapped.push(m);
    else stats.skipped_invalid += 1;
  }

  if (mapped.length === 0) return stats;

  // Find existing gf_entry_ids to dedupe
  const ids = mapped.map((m) => m.gf_entry_id);
  const { data: existingRows, error: selErr } = await supabase
    .from("candidates")
    .select("gf_entry_id")
    .in("gf_entry_id", ids);
  if (selErr) {
    stats.errors.push(`Dedup query: ${selErr.message}`);
    return stats;
  }
  const existingSet = new Set((existingRows ?? []).map((r) => r.gf_entry_id));
  const toCreate = mapped.filter((m) => !existingSet.has(m.gf_entry_id));
  stats.skipped_existing = mapped.length - toCreate.length;

  if (toCreate.length === 0) return stats;

  // Insert candidates batch
  const candidateRows = toCreate.map((m) => ({
    email: m.email,
    full_name: m.full_name,
    phone: m.phone,
    birth_date: m.birth_date,
    city: m.city,
    source: m.source,
    gf_entry_id: m.gf_entry_id,
    raw_payload: m.raw_payload,
  }));

  const { data: createdCandsRaw, error: insErr } = await (
    supabase.from("candidates") as unknown as {
      insert: (rows: unknown[]) => { select: (s: string) => Promise<{ data: { id: string; gf_entry_id: string }[] | null; error: { message: string } | null }> };
    }
  )
    .insert(candidateRows)
    .select("id, gf_entry_id");

  if (insErr) {
    stats.errors.push(`Insert candidates: ${insErr.message}`);
    return stats;
  }
  const createdCands = (createdCandsRaw ?? []) as { id: string; gf_entry_id: string }[];
  stats.created = createdCands.length;

  // Insert applications + (optional) motivation
  const appRows = createdCands.map((c) => {
    const m = toCreate.find((x) => x.gf_entry_id === c.gf_entry_id);
    return {
      candidate_id: c.id,
      job_id: null,
      status: "new" as const,
      motivation: m?.motivation ?? null,
    };
  });
  const { error: appErr } = await (supabase.from("applications") as unknown as {
    insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
  }).insert(appRows);
  if (appErr) stats.errors.push(`Insert applications: ${appErr.message}`);

  return stats;
}
