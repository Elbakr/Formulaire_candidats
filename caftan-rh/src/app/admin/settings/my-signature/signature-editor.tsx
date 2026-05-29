"use client";

// Karim 2026-05-29 : editeur de signature - canvas pour dessiner OU upload PNG.
// Stocke la signature en dataURL (text base64) dans profiles.signature_data_url.

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveSignatureAction } from "./actions";

export function SignatureEditor({ existing, userId }: { existing: string | null; userId: string }) {
  void userId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
  }, []);

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
    canvas.setPointerCapture(e.pointerId);
  }
  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function stopDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    setIsDrawing(false);
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Format invalide. Utilise une image PNG/JPG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    let dataUrl: string | null = null;
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        toast.error("Dessine ta signature d'abord.");
        return;
      }
      dataUrl = canvas.toDataURL("image/png");
    } else {
      if (!uploadedDataUrl) {
        toast.error("Choisis un fichier d'abord.");
        return;
      }
      dataUrl = uploadedDataUrl;
    }
    if (!dataUrl) return;
    startTransition(async () => {
      const res = await saveSignatureAction(dataUrl);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Signature enregistrée. Les futurs contrats seront pré-signés automatiquement.");
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="px-3 py-2 border-b border-line flex items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
          <button type="button" onClick={() => setMode("draw")} className={`px-2 py-1 text-xs font-bold rounded inline-flex items-center gap-1 ${mode === "draw" ? "bg-gold text-[#1a1a0d]" : "text-ink-3"}`}>
            <Pencil className="h-3 w-3" /> Dessiner
          </button>
          <button type="button" onClick={() => setMode("upload")} className={`px-2 py-1 text-xs font-bold rounded inline-flex items-center gap-1 ${mode === "upload" ? "bg-gold text-[#1a1a0d]" : "text-ink-3"}`}>
            <Upload className="h-3 w-3" /> Uploader PNG
          </button>
        </div>
        <span className="ml-auto text-[10px] text-ink-3">{existing ? "Signature actuelle visible au-dessus" : "Aucune signature stockée"}</span>
      </div>

      {mode === "draw" ? (
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-ink-3">Dessine ta signature au stylet, souris ou doigt dans le cadre :</p>
          <div className="border border-dashed border-line rounded bg-white inline-block">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={stopDraw}
              onPointerLeave={stopDraw}
              className="touch-none cursor-crosshair"
              style={{ width: "100%", maxWidth: "600px" }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearCanvas} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5" /> Effacer
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={pending || !hasDrawn} className="ml-auto">
              <Save className="h-3.5 w-3.5" />
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <p className="text-[11px] text-ink-3">Upload une image PNG/JPG (fond transparent recommandé) :</p>
          <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} className="text-xs" />
          {uploadedDataUrl ? (
            <div className="border border-dashed border-line rounded p-2 bg-white">
              <div className="text-[10px] uppercase font-bold text-ink-3 mb-1">Aperçu</div>
              <img src={uploadedDataUrl} alt="Preview" className="max-h-32" />
            </div>
          ) : null}
          <Button type="button" size="sm" onClick={handleSave} disabled={pending || !uploadedDataUrl}>
            <Save className="h-3.5 w-3.5" />
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </Card>
  );
}
