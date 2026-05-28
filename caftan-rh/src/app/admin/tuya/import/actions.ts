"use server";

// Karim 2026-05-24 : Import CSV de pointages manuels.
// Justification : l API cloud Tuya ne retient que ~7 jours d historique
// d unlock events (purge automatique cote Tuya). Les pointages physiques
// effectues avant ~17/05/2026 ne sont donc PAS recuperables via le poll.
// Cette action permet a admin/rh de rattraper manuellement ces journees
// en collant un CSV (export Excel, ressaisie a partir d un cahier papier,
// ou recopie depuis l ecran du terminal).
//
// Format CSV attendu (en-tete optionnelle, separateur , ou ; tolere) :
//   employee_full_name,date,in_time,out_time,site_code
//   Keltoum El Mrabet,2026-05-01,07:45,17:30,A
//
// Pour chaque ligne : 1 entry IN + (si out_time) 1 entry OUT,
//   kind='in'/'out', source='manual_admin', entry_method='manual_admin',
//   shift_id=null (la page Prestations rattachera automatiquement).

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ParsedRow = {
  lineNumber: number;
  raw: string;
  employee_full_name: string;
  date: string;
  in_time: string;
  out_time: string | null;
  site_code: string;
};

export type ResolvedRow = ParsedRow & {
  employee_id: string;
  employee_label: string;
  site_id: string;
  site_label: string;
  in_at_utc: string;
  out_at_utc: string | null;
};

export type ImportError = {
  lineNumber: number;
  raw: string;
  message: string;
  suggestions?: string[];
};

export type ImportSummary = {
  ok: boolean;
  totalLines: number;
  validRows: ResolvedRow[];
  errors: ImportError[];
  inserted: number;
  skipped: number;
  dryRun: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convertit une heure locale Europe/Brussels en timestamp UTC ISO.
 * En mai on est en heure d ete (CEST = UTC+2) donc "07:45" Brussels = 05:45 UTC.
 * On utilise Intl pour calculer l offset reel pour la date donnee (gere bien
 * les transitions de DST). Approche : on construit la date naive UTC, on
 * regarde quelle heure locale Brussels Intl rendrait pour cet instant, et
 * on corrige du delta.
 */
function brusselsLocalToUtc(dateYmd: string, hhmm: string): string | null {
  // dateYmd attendu YYYY-MM-DD ; hhmm attendu HH:MM ou HH:MM:SS
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm.trim());
  if (!m || !t) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(t[1]);
  const mi = Number(t[2]);
  const s = t[3] ? Number(t[3]) : 0;
  if (
    mo < 1 || mo > 12 || d < 1 || d > 31 ||
    h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59
  ) {
    return null;
  }
  // Construit l instant en UTC en faisant comme si c etait deja UTC,
  // puis on retire l offset Brussels pour ce moment-la.
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const guessDate = new Date(guessUtcMs);
  // Recupere l heure que Intl afficherait a Brussels pour cet instant.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Brussels",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(guessDate);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const localY = get("year");
  const localMo = get("month");
  const localD = get("day");
  let localH = get("hour");
  if (localH === 24) localH = 0; // edge case en-US "24:00"
  const localMi = get("minute");
  const localS = get("second");
  const asUtcMs = Date.UTC(localY, localMo - 1, localD, localH, localMi, localS);
  const offsetMs = asUtcMs - guessUtcMs;
  const realUtcMs = guessUtcMs - offsetMs;
  return new Date(realUtcMs).toISOString();
}

/** Parse une ligne CSV en tolerant , ou ;, espaces et guillemets simples. */
function splitCsvLine(line: string): string[] {
  // Detecte le separateur (priorite ; si present ailleurs que dans un nom)
  const sep = line.includes(";") && !line.match(/,[^;]/) ? ";" : ",";
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 4) return false;
  const lower = cells.map((c) => c.toLowerCase());
  return lower.some((c) => c.includes("employee") || c.includes("nom") || c === "name") &&
         lower.some((c) => c === "date") &&
         lower.some((c) => c.includes("time") || c.includes("heure"));
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// ─── Action principale ────────────────────────────────────────────────────────

export async function importCsvAction(
  rawCsv: string,
  dryRun: boolean,
): Promise<ImportSummary> {
  await requireRole(["admin", "rh"]);

  const supabase = await createClient();

  // 1) Charge les employes + sites une fois
  const [{ data: empRaw }, { data: siteRaw }] = await Promise.all([
    supabase.from("employees").select("id, full_name, status").order("full_name"),
    supabase.from("sites").select("id, code, name").order("code"),
  ]);
  const employees = (empRaw ?? []) as { id: string; full_name: string; status: string }[];
  const sites = (siteRaw ?? []) as { id: string; code: string; name: string }[];

  const empNormIndex = employees.map((e) => ({ ...e, norm: normalizeForMatch(e.full_name) }));
  const siteByCode = new Map(sites.map((s) => [s.code.trim().toUpperCase(), s]));

  // 2) Decoupe le CSV en lignes
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l, idx) => ({ raw: l, lineNumber: idx + 1 }))
    .filter((l) => l.raw.trim() !== "" && !l.raw.trim().startsWith("#"));

  const errors: ImportError[] = [];
  const resolved: ResolvedRow[] = [];

  let startIdx = 0;
  if (lines.length > 0) {
    const firstCells = splitCsvLine(lines[0].raw);
    if (isHeaderRow(firstCells)) startIdx = 1;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const { raw, lineNumber } = lines[i];
    const cells = splitCsvLine(raw);
    if (cells.length < 4) {
      errors.push({
        lineNumber,
        raw,
        message: `Ligne incomplète : ${cells.length} colonnes (attendu : employee_full_name, date, in_time, out_time, site_code)`,
      });
      continue;
    }
    const [employeeName, dateStr, inTimeStr, outTimeStr, siteCodeStr] = [
      cells[0] ?? "",
      cells[1] ?? "",
      cells[2] ?? "",
      cells[3] ?? "",
      cells[4] ?? "",
    ];

    const parsedRow: ParsedRow = {
      lineNumber,
      raw,
      employee_full_name: employeeName.trim(),
      date: dateStr.trim(),
      in_time: inTimeStr.trim(),
      out_time: outTimeStr.trim() || null,
      site_code: siteCodeStr.trim().toUpperCase(),
    };

    if (!parsedRow.employee_full_name) {
      errors.push({ lineNumber, raw, message: "Nom d'employé vide" });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedRow.date)) {
      errors.push({ lineNumber, raw, message: `Date invalide '${parsedRow.date}' (format attendu YYYY-MM-DD)` });
      continue;
    }
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(parsedRow.in_time)) {
      errors.push({ lineNumber, raw, message: `Heure IN invalide '${parsedRow.in_time}' (format attendu HH:MM)` });
      continue;
    }
    if (parsedRow.out_time && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(parsedRow.out_time)) {
      errors.push({ lineNumber, raw, message: `Heure OUT invalide '${parsedRow.out_time}' (format attendu HH:MM)` });
      continue;
    }

    // Resolve employee : match exact normalise, sinon "contient", sinon Levenshtein
    const targetNorm = normalizeForMatch(parsedRow.employee_full_name);
    let emp = empNormIndex.find((e) => e.norm === targetNorm);
    if (!emp) {
      const contains = empNormIndex.filter((e) => e.norm.includes(targetNorm) || targetNorm.includes(e.norm));
      if (contains.length === 1) emp = contains[0];
    }
    if (!emp) {
      const ranked = [...empNormIndex]
        .map((e) => ({ e, d: levenshtein(targetNorm, e.norm) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      errors.push({
        lineNumber,
        raw,
        message: `Employé '${parsedRow.employee_full_name}' non trouvé`,
        suggestions: ranked.map((r) => r.e.full_name),
      });
      continue;
    }

    // Resolve site
    const site = siteByCode.get(parsedRow.site_code);
    if (!site) {
      const codes = [...siteByCode.keys()].join(", ");
      errors.push({
        lineNumber,
        raw,
        message: `Site code '${parsedRow.site_code}' inconnu (codes disponibles : ${codes})`,
      });
      continue;
    }

    const inAtUtc = brusselsLocalToUtc(parsedRow.date, parsedRow.in_time);
    if (!inAtUtc) {
      errors.push({ lineNumber, raw, message: `Conversion date+heure IN impossible` });
      continue;
    }
    let outAtUtc: string | null = null;
    if (parsedRow.out_time) {
      outAtUtc = brusselsLocalToUtc(parsedRow.date, parsedRow.out_time);
      if (!outAtUtc) {
        errors.push({ lineNumber, raw, message: `Conversion date+heure OUT impossible` });
        continue;
      }
      // Si OUT < IN, on suppose un OUT le lendemain (shift de nuit, rare)
      if (new Date(outAtUtc).getTime() <= new Date(inAtUtc).getTime()) {
        const dayAfterMs = new Date(outAtUtc).getTime() + 24 * 60 * 60 * 1000;
        outAtUtc = new Date(dayAfterMs).toISOString();
      }
    }

    resolved.push({
      ...parsedRow,
      employee_id: emp.id,
      employee_label: emp.full_name,
      site_id: site.id,
      site_label: `${site.code} — ${site.name}`,
      in_at_utc: inAtUtc,
      out_at_utc: outAtUtc,
    });
  }

  const summary: ImportSummary = {
    ok: true,
    totalLines: lines.length - startIdx,
    validRows: resolved,
    errors,
    inserted: 0,
    skipped: 0,
    dryRun,
  };

  if (dryRun) return summary;

  // 3) Insertion reelle
  let inserted = 0;
  let skipped = 0;
  const insertErrors: ImportError[] = [];

  for (const row of resolved) {
    // Dedup soft : si une entry manuelle IN existe deja a +/- 1 minute pour cet
    // employe a cette date, on skip pour eviter les doublons en cas de re-import.
    const inMs = new Date(row.in_at_utc).getTime();
    const fromIso = new Date(inMs - 60_000).toISOString();
    const toIso = new Date(inMs + 60_000).toISOString();
    const { data: dupIn } = await supabase
      .from("clock_entries")
      .select("id")
      .eq("employee_id", row.employee_id)
      .eq("kind", "in")
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .limit(1);
    if (dupIn && dupIn.length > 0) {
      skipped++;
      continue;
    }

    const note = `Import CSV manuel (${row.date}) — Tuya cloud purged`;
    const { error: errIn } = await supabase.from("clock_entries").insert({
      employee_id: row.employee_id,
      site_id: row.site_id,
      shift_id: null,
      kind: "in",
      occurred_at: row.in_at_utc,
      entry_method: "manual_admin",
      source: "manual_admin",
      notes: note,
    });
    if (errIn) {
      insertErrors.push({ lineNumber: row.lineNumber, raw: row.raw, message: `Insert IN: ${errIn.message}` });
      continue;
    }
    inserted++;

    if (row.out_at_utc) {
      const { error: errOut } = await supabase.from("clock_entries").insert({
        employee_id: row.employee_id,
        site_id: row.site_id,
        shift_id: null,
        kind: "out",
        occurred_at: row.out_at_utc,
        entry_method: "manual_admin",
        source: "manual_admin",
        notes: note,
      });
      if (errOut) {
        insertErrors.push({ lineNumber: row.lineNumber, raw: row.raw, message: `Insert OUT: ${errOut.message}` });
      } else {
        inserted++;
      }
    }
  }

  summary.inserted = inserted;
  summary.skipped = skipped;
  summary.errors = [...errors, ...insertErrors];

  revalidatePath("/admin/tuya/import");
  revalidatePath("/admin/presence");
  return summary;
}
