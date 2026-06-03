"use client";

import { useTransition } from "react";
import { Download, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportPayslipsCsvAction, exportPayslipsWinbooksXmlAction } from "./actions";

export function ExportButtons({ year, employer }: { year: number; employer: string }) {
  const [pending, startTransition] = useTransition();

  function download(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csv() {
    startTransition(async () => {
      const r = await exportPayslipsCsvAction({ year, employer });
      if (r.ok && r.csv) {
        download(r.csv, `salaires_${year}_${employer}.csv`, "text/csv;charset=utf-8");
        toast.success("CSV téléchargé");
      } else toast.error(r.error ?? "KO");
    });
  }
  function winbooks() {
    startTransition(async () => {
      const r = await exportPayslipsWinbooksXmlAction({ year, employer });
      if (r.ok && r.xml) {
        download(r.xml, `winbooks_${year}_${employer}.xml`, "application/xml;charset=utf-8");
        toast.success("XML Winbooks téléchargé");
      } else toast.error(r.error ?? "KO");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={csv} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={winbooks} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        XML Winbooks
      </Button>
    </div>
  );
}
