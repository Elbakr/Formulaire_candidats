"use server";

import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/components/ui/badge";

type ExportResult =
  | { ok: true; base64: string; filename: string; count: number }
  | { ok: false; error: string };

type CandidateInfo = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  nrn: string | null;
  iban: string | null;
  address: string | null;
  postal_code: string | null;
  source: string | null;
};

type AppRow = {
  id: string;
  status: string;
  rating: number | null;
  motivation: string | null;
  created_at: string;
  updated_at: string;
  job: { title: string | null } | null;
  candidate: CandidateInfo | null;
};

/**
 * Build an Excel workbook of all applications + candidate data.
 * Returns a base64-encoded .xlsx — the client converts it to a Blob
 * for download.
 */
export async function exportCandidatesAction(): Promise<ExportResult> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select(
      `id, status, rating, motivation, created_at, updated_at,
       job:jobs(title),
       candidate:candidates(id, full_name, email, phone, city, nrn, iban, address, postal_code, source)`,
    )
    .order("created_at", { ascending: false })
    .range(0, 5000);

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as AppRow[];

  // ---- Sheet 1 : Candidats ----
  const candidatRows = rows.map((a) => {
    const c = a.candidate;
    const motivation = (a.motivation ?? "").replace(/\s+/g, " ").trim();
    return {
      id: a.id,
      full_name: c?.full_name ?? "",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      city: c?.city ?? "",
      status: STATUS_LABELS[a.status] ?? a.status,
      job_title: a.job?.title ?? "Spontanée",
      source: c?.source ?? "",
      created_at: a.created_at,
      motivation: motivation.length > 500 ? motivation.slice(0, 497) + "..." : motivation,
      nrn: c?.nrn ?? "",
      iban: c?.iban ?? "",
      address: c?.address ?? "",
      postal_code: c?.postal_code ?? "",
    };
  });

  const wsCandidats = XLSX.utils.json_to_sheet(candidatRows, {
    header: [
      "id",
      "full_name",
      "email",
      "phone",
      "city",
      "status",
      "job_title",
      "source",
      "created_at",
      "motivation",
      "nrn",
      "iban",
      "address",
      "postal_code",
    ],
  });
  // sensible column widths
  wsCandidats["!cols"] = [
    { wch: 36 },
    { wch: 24 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 60 },
    { wch: 14 },
    { wch: 22 },
    { wch: 30 },
    { wch: 10 },
  ];

  // ---- Sheet 2 : Stats ----
  const byStatus = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byMonth = new Map<string, number>();

  for (const a of rows) {
    const s = STATUS_LABELS[a.status] ?? a.status;
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);

    const src = a.candidate?.source ?? "(inconnu)";
    bySource.set(src, (bySource.get(src) ?? 0) + 1);

    const m = a.created_at?.slice(0, 7) ?? "?";
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }

  const statsRows: Array<Array<string | number>> = [];
  statsRows.push(["Total candidatures", rows.length]);
  statsRows.push([]);
  statsRows.push(["Par statut", "Count"]);
  for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) statsRows.push([k, v]);
  statsRows.push([]);
  statsRows.push(["Par source", "Count"]);
  for (const [k, v] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) statsRows.push([k, v]);
  statsRows.push([]);
  statsRows.push(["Par mois (YYYY-MM)", "Count"]);
  for (const [k, v] of [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) statsRows.push([k, v]);

  const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
  wsStats["!cols"] = [{ wch: 26 }, { wch: 10 }];

  // ---- Workbook ----
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCandidats, "Candidats");
  XLSX.utils.book_append_sheet(wb, wsStats, "Stats");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const base64 = Buffer.from(buf).toString("base64");

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `candidats-${stamp}.xlsx`;

  return { ok: true, base64, filename, count: rows.length };
}
