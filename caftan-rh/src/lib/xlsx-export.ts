// Helper d'export XLSX simple — wrap autour de la dépendance `xlsx`.
// Utilisable côté navigateur uniquement (déclenche un download).

import * as XLSX from "xlsx";

export type SheetSpec<T> = {
  name: string; // max 31 chars
  rows: T[];
  columns: Array<{
    key: keyof T | ((row: T) => unknown);
    header: string;
    width?: number;
  }>;
};

export function downloadXlsx<T>(
  filename: string,
  sheets: SheetSpec<T>[],
): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa: unknown[][] = [s.columns.map((c) => c.header)];
    for (const row of s.rows) {
      aoa.push(
        s.columns.map((c) =>
          typeof c.key === "function"
            ? c.key(row)
            : (row[c.key as keyof T] as unknown),
        ),
      );
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (s.columns.some((c) => c.width)) {
      ws["!cols"] = s.columns.map((c) => ({ wch: c.width ?? 15 }));
    }
    const safeName = s.name.slice(0, 31).replace(/[\\/?*\[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const safeFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
}
