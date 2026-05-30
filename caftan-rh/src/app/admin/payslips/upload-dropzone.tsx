"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { uploadPayslipBatchAction } from "./actions";
import { toast } from "sonner";

export function UploadDropzone() {
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [employer, setEmployer] = useState<"amd_megastore" | "caftan_factory">("amd_megastore");
  const [lastResult, setLastResult] = useState<{ matched: number; unmatched: number } | null>(null);

  function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Fichier PDF requis");
      return;
    }
    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("employer_org_key", employer);
    startTransition(async () => {
      const res = await uploadPayslipBatchAction(fd);
      if (res.ok) {
        setLastResult({ matched: res.matched, unmatched: res.unmatched });
        toast.success(`${res.matched} fiches matchees, ${res.unmatched} non matchees`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Employeur :</span>
          <select
            value={employer}
            onChange={(e) => setEmployer(e.target.value as "amd_megastore" | "caftan_factory")}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="amd_megastore">AMD MEGASTORE SRL</option>
            <option value="caftan_factory">CAFTAN FACTORY SRL</option>
          </select>
        </div>
        {lastResult && (
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> {lastResult.matched} matchees
            </span>
            {lastResult.unmatched > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <XCircle className="w-3.5 h-3.5" /> {lastResult.unmatched} non matchees
              </span>
            )}
          </div>
        )}
      </div>
      <label
        htmlFor="payslip-pdf-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`block p-12 text-center cursor-pointer transition-colors ${
          dragging ? "bg-blue-50 border-blue-400" : "bg-muted/30 hover:bg-muted/50"
        } ${pending ? "opacity-50 pointer-events-none" : ""}`}
      >
        {pending ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Traitement du PDF (split + match + QR)...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium">
              Glisser un PDF groupé de fiches de paie ici, ou clique pour parcourir
            </span>
            <span className="text-xs">
              Le PDF sera splité par employé, chaque fiche aura son QR EPC SEPA pour BNP Paribas
            </span>
          </div>
        )}
        <input
          id="payslip-pdf-input"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
      </label>
    </Card>
  );
}
