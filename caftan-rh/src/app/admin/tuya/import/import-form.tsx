"use client";

import { useState, useTransition } from "react";
import { FileUp, Eye, Upload, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { importCsvAction, type ImportSummary } from "./actions";

const SAMPLE_CSV = `employee_full_name,date,in_time,out_time,site_code
Keltoum El Mrabet,2026-05-01,07:45,17:30,A
Selma Maïssa,2026-05-01,08:00,17:00,E`;

export function ImportForm() {
  const [pending, startTransition] = useTransition();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      setPreview(null);
      setImported(null);
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    if (!csv.trim()) {
      toast.error("Le CSV est vide.");
      return;
    }
    setImported(null);
    startTransition(async () => {
      const r = await importCsvAction(csv, true);
      setPreview(r);
      if (r.errors.length === 0) {
        toast.success(`${r.validRows.length} ligne(s) valide(s) prête(s).`);
      } else {
        toast.warning(`${r.validRows.length} ligne(s) OK, ${r.errors.length} erreur(s).`);
      }
    });
  }

  function handleImport() {
    if (!csv.trim()) {
      toast.error("Le CSV est vide.");
      return;
    }
    if (!preview) {
      toast.error("Lance d'abord la prévisualisation.");
      return;
    }
    if (!confirm(`Importer ${preview.validRows.length} ligne(s) ? Cette action insère en base.`)) return;
    startTransition(async () => {
      const r = await importCsvAction(csv, false);
      setImported(r);
      if (r.inserted > 0) {
        toast.success(`${r.inserted} entrée(s) insérée(s).`);
      }
      if (r.errors.length > 0) {
        toast.warning(`${r.errors.length} erreur(s) lors de l'import.`);
      }
    });
  }

  function handleReset() {
    setCsv("");
    setPreview(null);
    setImported(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm">1. Coller le CSV ou charger un fichier</h2>
              <p className="text-[11px] text-ink-3 mt-0.5">
                Tu peux coller directement depuis Excel/Google Sheets, ou uploader un .csv/.txt.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-line rounded-[var(--radius-sm)] hover:bg-ink-0/5">
                <FileUp className="h-3.5 w-3.5" />
                Charger fichier
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCsv(SAMPLE_CSV)}
                type="button"
              >
                Charger exemple
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReset} type="button">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          </div>

          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
              setImported(null);
            }}
            placeholder={SAMPLE_CSV}
            rows={10}
            className="font-mono text-[12px]"
          />

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handlePreview} disabled={pending} type="button">
              <Eye className="h-4 w-4" />
              {pending ? "Analyse…" : "Prévisualiser"}
            </Button>
            <Button
              onClick={handleImport}
              disabled={pending || !preview || preview.validRows.length === 0}
              variant="gold"
              type="button"
            >
              <Upload className="h-4 w-4" />
              {pending ? "Import…" : `Importer ${preview ? `(${preview.validRows.length})` : ""}`}
            </Button>
          </div>
        </div>
      </Card>

      {preview && !imported && (
        <PreviewCard preview={preview} />
      )}

      {imported && <ResultCard summary={imported} />}
    </div>
  );
}

function PreviewCard({ preview }: { preview: ImportSummary }) {
  return (
    <Card>
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-600" />
          Prévisualisation (dry-run, rien n&apos;a été inséré)
        </h2>
        <div className="flex gap-4 text-xs text-ink-2 mt-1">
          <span><strong>{preview.totalLines}</strong> ligne(s) analysée(s)</span>
          <span className="text-emerald-700">
            <strong>{preview.validRows.length}</strong> valide(s)
          </span>
          <span className="text-red-700">
            <strong>{preview.errors.length}</strong> erreur(s)
          </span>
        </div>
      </div>

      {preview.validRows.length > 0 && (
        <div className="p-4 border-b border-line">
          <h3 className="text-xs font-bold mb-2 text-emerald-800">
            Lignes valides ({preview.validRows.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-left text-ink-3 border-b border-line">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Employée</th>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">IN (Brussels)</th>
                  <th className="py-1 pr-2">OUT (Brussels)</th>
                  <th className="py-1 pr-2">Site</th>
                </tr>
              </thead>
              <tbody>
                {preview.validRows.slice(0, 50).map((r) => (
                  <tr key={r.lineNumber} className="border-b border-line/40">
                    <td className="py-1 pr-2 text-ink-3">{r.lineNumber}</td>
                    <td className="py-1 pr-2">{r.employee_label}</td>
                    <td className="py-1 pr-2">{r.date}</td>
                    <td className="py-1 pr-2 font-mono">{r.in_time}</td>
                    <td className="py-1 pr-2 font-mono">{r.out_time ?? "—"}</td>
                    <td className="py-1 pr-2">{r.site_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.validRows.length > 50 && (
              <p className="text-[10px] text-ink-3 italic mt-1">
                …et {preview.validRows.length - 50} autres lignes valides.
              </p>
            )}
          </div>
        </div>
      )}

      {preview.errors.length > 0 && (
        <div className="p-4">
          <h3 className="text-xs font-bold mb-2 text-red-800 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Erreurs ({preview.errors.length})
          </h3>
          <ul className="space-y-2 text-[11px]">
            {preview.errors.map((e, i) => (
              <li key={i} className="border border-red-200 bg-red-50/40 rounded p-2">
                <div className="font-mono text-red-900">
                  Ligne {e.lineNumber} : {e.message}
                </div>
                <div className="text-ink-3 mt-1 font-mono text-[10px] truncate">
                  {e.raw}
                </div>
                {e.suggestions && e.suggestions.length > 0 && (
                  <div className="text-[10px] text-ink-2 mt-1">
                    Suggestions :{" "}
                    {e.suggestions.map((s, j) => (
                      <code key={j} className="bg-amber-100 px-1 mr-1 rounded">{s}</code>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ResultCard({ summary }: { summary: ImportSummary }) {
  return (
    <Card className={summary.inserted > 0 ? "border-emerald-300 bg-emerald-50/30" : "border-amber-300 bg-amber-50/30"}>
      <div className="p-4">
        <h2 className="font-bold text-sm flex items-center gap-2">
          {summary.inserted > 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          )}
          Import terminé
        </h2>
        <ul className="mt-2 text-xs space-y-1">
          <li><strong>{summary.inserted}</strong> entrée(s) insérée(s) en base (IN + OUT comptés séparément)</li>
          <li><strong>{summary.skipped}</strong> ligne(s) ignorée(s) (doublon détecté +/- 1 min)</li>
          <li><strong>{summary.errors.length}</strong> erreur(s)</li>
        </ul>
        {summary.errors.length > 0 && (
          <details className="mt-3 text-[11px]">
            <summary className="cursor-pointer text-red-800 font-medium">
              Voir les erreurs ({summary.errors.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {summary.errors.map((e, i) => (
                <li key={i} className="font-mono text-red-900">
                  Ligne {e.lineNumber} : {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
