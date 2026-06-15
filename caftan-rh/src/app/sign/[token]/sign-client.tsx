"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { Eraser, Check, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { submitSignatureAction } from "./actions";

export function SignContractClient({
  contractId,
  token,
  renderedBody,
  fullName,
}: {
  contractId: string;
  token: string;
  renderedBody: string;
  fullName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSigned, setHasSigned] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  // Initialise canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    // Background blanc
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "#1a1a0d";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      const rect = cv!.getBoundingClientRect();
      if ("touches" in e && e.touches.length > 0) {
        return {
          x: (e.touches[0].clientX - rect.left) * (cv!.width / rect.width),
          y: (e.touches[0].clientY - rect.top) * (cv!.height / rect.height),
        };
      }
      const me = e as MouseEvent;
      return {
        x: (me.clientX - rect.left) * (cv!.width / rect.width),
        y: (me.clientY - rect.top) * (cv!.height / rect.height),
      };
    }
    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      lastX = p.x;
      lastY = p.y;
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx!.beginPath();
      ctx!.moveTo(lastX, lastY);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
      lastX = p.x;
      lastY = p.y;
      setHasSigned(true);
    }
    function end() {
      drawing = false;
    }

    cv.addEventListener("mousedown", start);
    cv.addEventListener("mousemove", move);
    cv.addEventListener("mouseup", end);
    cv.addEventListener("mouseleave", end);
    cv.addEventListener("touchstart", start, { passive: false });
    cv.addEventListener("touchmove", move, { passive: false });
    cv.addEventListener("touchend", end);
    return () => {
      cv.removeEventListener("mousedown", start);
      cv.removeEventListener("mousemove", move);
      cv.removeEventListener("mouseup", end);
      cv.removeEventListener("mouseleave", end);
      cv.removeEventListener("touchstart", start);
      cv.removeEventListener("touchmove", move);
      cv.removeEventListener("touchend", end);
    };
  }, []);

  function clearCanvas() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    setHasSigned(false);
  }

  function submit() {
    const cv = canvasRef.current;
    if (!cv) return;
    if (!hasSigned) {
      toast.error("Signe d'abord dans le cadre avant de valider.");
      return;
    }
    if (!accepted) {
      toast.error("Tu dois cocher la case d'acceptation.");
      return;
    }
    const signaturePng = cv.toDataURL("image/png");
    startTransition(async () => {
      const r = await submitSignatureAction({ contractId, token, signaturePng });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Contrat signé !");
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <Card className="border-success bg-success-light/30">
        <div className="p-6 text-center space-y-4">
          <div>
            <div className="text-4xl mb-2">✓</div>
            <h2 className="text-xl font-bold text-success">Contrat signé !</h2>
            <p className="text-sm text-ink-2 mt-2">
              Merci {fullName.split(" ")[0]}. Ton contrat — avec les deux signatures — t&apos;est envoyé par mail (PDF).
              Tu peux aussi le télécharger ici :
            </p>
          </div>
          <a
            href={`/api/contracts/sign/${token}/pdf?download=1`}
            className="w-full min-h-[48px] rounded-xl bg-gold text-[#1a1a0d] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <FileSignature className="h-4 w-4" /> Télécharger mon contrat signé (PDF)
          </a>
          <a
            href="/me"
            className="w-full min-h-[48px] rounded-xl border-2 border-line bg-surface text-ink font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            Aller à mon espace →
          </a>
        </div>
      </Card>
    );
  }

  // Convertit markdown basique en HTML simple pour l affichage (repli ancien format)
  function md2html(md: string): string {
    return md
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/^(.+)$/m, '<p class="mb-2">$1');
  }

  // Karim 2026-06-15 : si rendered_body est un document HTML complet (le « super
  // layout » pixel-perfect), on l'affiche dans une iframe isolée pour que son CSS
  // (Calibri, A4, articles) s'applique sans collision avec le thème de l'app.
  // Sinon (anciens contrats markdown), repli sur md2html.
  const isFullHtml = /<!doctype html|<html[\s>]/i.test(renderedBody);

  return (
    <>
      <Card>
        {isFullHtml ? (
          <iframe
            title="Contrat à signer"
            srcDoc={renderedBody}
            className="w-full rounded-md bg-white"
            style={{ height: "min(70vh, 900px)", border: "0" }}
          />
        ) : (
          <div className="p-4 max-h-[60vh] overflow-y-auto text-sm leading-relaxed bg-white">
            <div dangerouslySetInnerHTML={{ __html: md2html(renderedBody) }} />
          </div>
        )}
      </Card>

      <Card>
        <div className="p-4 space-y-3">
          <div className="text-sm font-bold flex items-center gap-1">
            <FileSignature className="h-4 w-4 text-gold-dark" />
            Signe ci-dessous (doigt sur mobile, souris sur ordinateur)
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="w-full border-2 border-dashed border-gold/40 rounded-md bg-white touch-none"
            style={{ touchAction: "none" }}
          />
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={clearCanvas} disabled={pending}>
              <Eraser className="h-3.5 w-3.5" /> Effacer
            </Button>
            <span className="text-[11px] text-ink-3">
              {hasSigned ? "✓ Signature détectée" : "Aucune signature"}
            </span>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded bg-gold-light/30 border border-gold/30">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              J&apos;ai lu et accepté les termes du présent contrat. Je confirme que ma signature ci-dessus est authentique et engage ma responsabilité.
              Cette signature électronique a valeur légale (eIDAS, Belgique).
            </span>
          </label>

          <Button
            onClick={submit}
            disabled={pending || !hasSigned || !accepted}
            className="w-full h-12 text-base bg-success hover:bg-success/90 text-white"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Valider et signer définitivement
          </Button>
        </div>
      </Card>
    </>
  );
}
