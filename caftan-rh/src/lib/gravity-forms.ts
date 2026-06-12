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
  postcode?: string; // Karim 18/05 : code postal Belgique 4 chiffres
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
  postal_code: string | null;
  source: string;
  raw_payload: Record<string, unknown>;
  gf_full_payload: Record<string, unknown>;
  motivation: string | null;
  cv_url: string | null;
  applied_at: string | null;
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

  // Karim 18/05 : le champ "postcode" (id 14 sur le nouveau formulaire) remplace
  // l ancien champ "city" qui retournait toujours "Bruxelles | Caftan Factory".
  // On extrait le code postal (4 chiffres BE) et on laisse city deriver du
  // be_postcodes lookup cote serveur (lib/distance.ts).
  const postcodeRaw = getField(entry, fieldMap.postcode);
  const postcodeMatch = postcodeRaw.match(/\b(\d{4})\b/);
  const postal_code = postcodeMatch ? postcodeMatch[1] : null;
  // Si pas de postcode mais city.x configure, garde-le en fallback (ancien
  // formulaire). Aussi accepte "City | Site" -> garde la partie city.
  const cityRaw = getField(entry, fieldMap.city);
  const city = cityRaw
    ? (cityRaw.includes("|") ? cityRaw.split("|")[0].trim() : cityRaw)
    : null;

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
    postal_code,
    source: "gravity_forms",
    motivation: motivationParts.length ? motivationParts.join("\n") : null,
    cv_url: findCvUrl(entry),
    applied_at: entry.date_created ? String(entry.date_created) : null,
    raw_payload: {
      gf_id: entry.id,
      form_id: entry.form_id,
      date_created: entry.date_created,
      ip: entry.ip,
      source_url: entry.source_url,
      user_agent: entry.user_agent,
    },
    // Karim 19/05 : on stocke aussi le payload complet pour pouvoir
    // re-extraire le CV plus tard si findCvUrl rate au premier passage
    // (ex : champ CV ajoute apres coup, nouveau mapping).
    gf_full_payload: entry as Record<string, unknown>,
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
  const mappedRaw: MappedCandidate[] = [];
  for (const entry of entries) {
    const m = mapGFEntry(entry, settings.field_map);
    if (m) mappedRaw.push(m);
    else stats.skipped_invalid += 1;
  }

  // Karim 15/05 : dedup interne par gf_entry_id. La pagination GF peut
  // renvoyer la meme entree deux fois sur la frontiere de page, et le batch
  // insert plante alors avec "duplicate key value violates unique constraint
  // uniq_candidates_gf_entry". On garde la 1ere occurrence.
  const mapped: MappedCandidate[] = [];
  const seenInBatch = new Set<string>();
  for (const m of mappedRaw) {
    if (seenInBatch.has(m.gf_entry_id)) continue;
    seenInBatch.add(m.gf_entry_id);
    mapped.push(m);
  }
  const dedupedInBatch = mappedRaw.length - mapped.length;
  if (dedupedInBatch > 0) {
    stats.errors.push(
      `${dedupedInBatch} doublon(s) GF deduplique(s) dans le batch (entrees retournees plusieurs fois par l API)`,
    );
  }

  if (mapped.length === 0) return stats;

  // Find existing gf_entry_ids to dedupe
  const ids = mapped.map((m) => m.gf_entry_id);
  const { data: existingRows, error: selErr } = await (
    supabase.from("candidates") as unknown as {
      select: (sel: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { gf_entry_id: string }[] | null; error: { message: string } | null }>;
      };
    }
  )
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

  // Karim 2026-06-04 : detection re-candidatures par EMAIL avant insert.
  // La contrainte uniq_candidates_gf_email bloquait les re-soumissions
  // (398 candidats valides perdus silencieusement). Approche definitive :
  // si email existe deja -> UPDATE candidate avec donnees nouvelles + ajoute
  // une application "new" pour tracer la re-candidature.
  const emails = Array.from(new Set(toCreate.map((m) => m.email)));
  const { data: emailExistingRaw } = await (
    supabase.from("candidates") as unknown as {
      select: (sel: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { id: string; email: string; applied_at: string | null }[] | null; error: { message: string } | null }>;
      };
    }
  )
    .select("id, email, applied_at")
    .in("email", emails);
  const emailToCandidateId = new Map<string, string>();
  for (const r of (emailExistingRaw ?? [])) emailToCandidateId.set(r.email.toLowerCase(), r.id);

  // Karim 2026-06-12 : FIX FLOOD applications. Avant, chaque sync re-inserait une
  // application pour tout gf_entry dont l'id != celui stocke sur le candidat. Un
  // candidat avec N soumissions historiques re-creait N-1 applications A CHAQUE
  // sync (1583/jour observe le 12/06). Correctif : derniere date de candidature
  // connue par candidat -> on ne trace une re-candidature que si la nouvelle
  // soumission est STRICTEMENT plus recente (cf. boucle path A). Idempotent.
  const ts = (v: string | null | undefined): number => {
    const t = v ? Date.parse(String(v)) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const lastSeenByCandidate = new Map<string, number>();
  for (const r of (emailExistingRaw ?? [])) lastSeenByCandidate.set(r.id, ts(r.applied_at));

  // Separe en : (a) re-candidatures (email existe) - on update + add application
  //           (b) nouveaux candidats - on insere
  const toUpdate: Array<{ candidateId: string; mapped: MappedCandidate }> = [];
  const toInsert: MappedCandidate[] = [];
  for (const m of toCreate) {
    const existingId = emailToCandidateId.get(m.email);
    if (existingId) toUpdate.push({ candidateId: existingId, mapped: m });
    else toInsert.push(m);
  }
  // Karim 2026-06-04 : dedupe in-batch par email pour les nouveaux candidats
  // (si 2 GF entries du meme nouveau candidat dans le meme batch -> on
  // insert le 1er, le 2eme passe en update via emailToCandidateId apres insert)
  const seenInsertEmails = new Set<string>();
  const dedupedInsert: MappedCandidate[] = [];
  const overflowToUpdate: MappedCandidate[] = [];
  for (const m of toInsert) {
    if (seenInsertEmails.has(m.email)) {
      overflowToUpdate.push(m);
    } else {
      seenInsertEmails.add(m.email);
      dedupedInsert.push(m);
    }
  }
  if (overflowToUpdate.length > 0) {
    stats.errors.push(`${overflowToUpdate.length} re-candidature(s) in-batch (meme email plusieurs fois) — traitees en update apres insert`);
  }

  // Update re-candidatures (path A) — traite du plus ancien au plus recent pour
  // que lastSeenByCandidate avance correctement et qu'on n'ecrase pas des donnees
  // recentes par des anciennes.
  const sortedUpdate = [...toUpdate].sort((a, b) => ts(a.mapped.applied_at) - ts(b.mapped.applied_at));
  for (const { candidateId, mapped: m } of sortedUpdate) {
    // Garde anti-flood : ignore les re-apparitions d'anciennes soumissions
    // (deja tracees). On ne (re)traite que les soumissions reellement nouvelles.
    const prevSeen = lastSeenByCandidate.get(candidateId) ?? 0;
    const curSeen = ts(m.applied_at);
    if (curSeen <= prevSeen) {
      stats.skipped_existing += 1;
      continue;
    }
    type UpdateClient = {
      update: (vals: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error: upErr } = await (supabase.from("candidates") as unknown as UpdateClient)
      // Karim 2026-06-04 : NE PAS update source - violerait uniq_candidates_gf_email
      // si existing source=manual et autre row gravity_forms du meme email.
      // Karim 2026-06-12 : NE PAS update gf_entry_id non plus — la nouvelle valeur
      // peut deja appartenir a une autre fiche (uniq_candidates_gf_entry). L'anti-flood
      // repose desormais sur applied_at, gf_entry_id n'a plus besoin d'etre reaffecte.
      .update({
        applied_at: m.applied_at,
        cv_url: m.cv_url,
        phone: m.phone,
        birth_date: m.birth_date,
        city: m.city,
        postal_code: m.postal_code,
        raw_payload: m.raw_payload,
        gf_full_payload: m.gf_full_payload,
      })
      .eq("id", candidateId);
    if (upErr) {
      stats.errors.push(`Update re-candidature ${m.gf_entry_id} (${m.email}): ${upErr.message}`);
      continue;
    }
    // Ajoute une application "new" pour tracer la re-candidature
    try {
      await (supabase.from("applications") as unknown as {
        insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
      }).insert([{ candidate_id: candidateId, job_id: null, status: "new", motivation: m.motivation }]);
    } catch {/* non bloquant */}
    lastSeenByCandidate.set(candidateId, curSeen); // anti-flood : cette soumission est desormais "vue"
    stats.created += 1;
  }

  // Karim 2026-06-04 : INSERT seulement les vrais nouveaux candidats (email
  // pas encore en BD). Les re-candidatures sont traitees ci-dessus en UPDATE.
  if (dedupedInsert.length === 0) {
    // Tous etaient des re-candidatures : on a deja update + ajoute applications.
    // Traite les overflow (re-soumissions intra-batch du meme nouveau candidat)
    // une fois qu'on a inserte le 1er.
    for (const m of overflowToUpdate) {
      const cidNow = emailToCandidateId.get(m.email);
      if (!cidNow) continue;
      type UpdateClient = {
        update: (vals: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
      await (supabase.from("candidates") as unknown as UpdateClient)
        .update({
          gf_entry_id: m.gf_entry_id,
          applied_at: m.applied_at,
          raw_payload: m.raw_payload,
          gf_full_payload: m.gf_full_payload,
        })
        .eq("id", cidNow);
    }
    return stats;
  }
  const candidateRows = dedupedInsert.map((m) => ({
    email: m.email,
    full_name: m.full_name,
    phone: m.phone,
    birth_date: m.birth_date,
    city: m.city,
    postal_code: m.postal_code,
    source: m.source,
    gf_entry_id: m.gf_entry_id,
    raw_payload: m.raw_payload,
    gf_full_payload: m.gf_full_payload,
    applied_at: m.applied_at,
    // Karim 2026-06-12 : PAS de `motivation` ici — cette colonne n'existe que sur
    // `applications`, pas sur `candidates`. L'inclure faisait echouer TOUT insert
    // de nouveau candidat (batch + fallback per-row) -> nouveaux candidats perdus.
    // La motivation est posee sur l'application plus bas (appRows).
    cv_url: m.cv_url,
  }));

  type InsertClient = {
    insert: (rows: unknown[]) => { select: (s: string) => Promise<{ data: { id: string; gf_entry_id: string }[] | null; error: { message: string } | null }> };
  };

  let createdCands: { id: string; gf_entry_id: string }[] = [];
  const { data: createdCandsRaw, error: insErr } = await (
    supabase.from("candidates") as unknown as InsertClient
  )
    .insert(candidateRows)
    .select("id, gf_entry_id");

  if (insErr) {
    // Fallback per-row : on inserte 1 par 1 pour eviter qu un seul conflit
    // (race ou bug GF) ne tue toute la batch. On log les echecs sans relancer.
    stats.errors.push(`Batch insert failed (${insErr.message}) -- fallback per-row`);
    for (const row of candidateRows) {
      const { data, error } = await (
        supabase.from("candidates") as unknown as InsertClient
      )
        .insert([row])
        .select("id, gf_entry_id");
      if (error) {
        stats.errors.push(`Skip ${row.gf_entry_id}: ${error.message}`);
        continue;
      }
      const rows = (data ?? []) as { id: string; gf_entry_id: string }[];
      createdCands.push(...rows);
    }
  } else {
    createdCands = (createdCandsRaw ?? []) as { id: string; gf_entry_id: string }[];
  }
  stats.created += createdCands.length;

  // Insert applications + (optional) motivation
  const appRows = createdCands.map((c) => {
    const m = dedupedInsert.find((x) => x.gf_entry_id === c.gf_entry_id);
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

  // Karim 2026-06-04 : traite les overflow (re-soumissions intra-batch
  // du meme nouveau candidat) maintenant qu'on connait son id.
  for (const m of overflowToUpdate) {
    const c = createdCands.find((x) => x.gf_entry_id === m.gf_entry_id) ??
      // Sinon retrouve via email (le 1er row du meme email vient d etre insere)
      createdCands.find((x) => dedupedInsert.find((d) => d.gf_entry_id === x.gf_entry_id)?.email === m.email);
    if (!c) continue;
    try {
      await (supabase.from("applications") as unknown as {
        insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
      }).insert([{ candidate_id: c.id, job_id: null, status: "new", motivation: m.motivation }]);
      stats.created += 1;
    } catch {/* */}
  }

  return stats;
}
