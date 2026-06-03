"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Camera, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { submitExpenseAction } from "./actions";

const CATEGORIES = [
  { v: "transport", l: "🚇 Transport" },
  { v: "meal", l: "🍽️ Repas" },
  { v: "office", l: "📎 Fourniture bureau" },
  { v: "parking", l: "🅿️ Parking" },
  { v: "fuel", l: "⛽ Carburant" },
  { v: "lodging", l: "🏨 Hébergement" },
  { v: "training", l: "📚 Formation" },
  { v: "other", l: "📦 Autre" },
];

export function ExpenseForm() {
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("transport");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string; type: string; previewUrl?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    const buf = await f.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
    setFile({ name: f.name, base64, type: f.type, previewUrl });
  }

  function submit() {
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt || amt <= 0) { toast.error("Montant invalide"); return; }
    startTransition(async () => {
      const r = await submitExpenseAction({
        amount: amt,
        expenseDate: date,
        category,
        description: description || undefined,
        vendor: vendor || undefined,
        vatAmount: vatAmount ? parseFloat(vatAmount.replace(",", ".")) : undefined,
        receiptBase64: file?.base64,
        receiptName: file?.name,
        receiptMime: file?.type,
      });
      if (r.ok) {
        toast.success("Note de frais soumise. En attente validation RH.");
        setAmount(""); setDescription(""); setVendor(""); setVatAmount("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } else toast.error(r.error ?? "KO");
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Montant € *</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="12.50" />
        </div>
        <div>
          <Label>Date *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>
      <div>
        <Label>Catégorie *</Label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface">
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
      </div>
      <div>
        <Label>Commerçant / fournisseur</Label>
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Ex: SNCB, McDonald's, Q8..." />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Trajet Bruxelles-Anvers pour visite client" />
      </div>
      <div>
        <Label>TVA € (optionnel)</Label>
        <Input type="number" step="0.01" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="2.10" />
      </div>

      <div className="border-2 border-dashed border-line rounded-lg p-3">
        {file ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono truncate flex-1">📎 {file.name}</span>
              <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-red-600"><X className="w-4 h-4" /></button>
            </div>
            {file.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.previewUrl} alt="preview" className="max-h-40 mx-auto rounded" />
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center gap-1 text-sm text-ink-3 hover:text-ink-1 py-3">
            <Camera className="w-6 h-6" />
            <span>Photo du justificatif</span>
            <span className="text-[10px]">JPG/PNG/PDF · max 10 MB</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} className="hidden" />
      </div>

      <Button variant="gold" onClick={submit} disabled={pending || !amount} className="w-full">
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Soumettre
      </Button>
    </div>
  );
}
