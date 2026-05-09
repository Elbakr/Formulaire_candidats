"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportCandidatesAction } from "./export-action";

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function ExportCandidatesButton() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await exportCandidatesAction();
        if (!res.ok) {
          toast.error(res.error || "Export impossible.");
          return;
        }
        const blob = base64ToBlob(
          res.base64,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`Export Excel généré (${res.count} candidatures).`);
      } catch (e) {
        toast.error((e as Error).message || "Erreur d'export.");
      }
    });
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      <Download className="h-4 w-4" /> {pending ? "Export…" : "Exporter Excel"}
    </Button>
  );
}
