"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { addTrainingAction } from "./actions";

const KINDS = [
  { v: "haccp", l: "🧼 HACCP" },
  { v: "first_aid", l: "🚑 Secourisme" },
  { v: "fire_safety", l: "🔥 Sécurité incendie" },
  { v: "languages", l: "🗣️ Langues" },
  { v: "cash_register", l: "💳 Caisse" },
  { v: "security", l: "🛡️ Sécurité" },
  { v: "forklift", l: "🚜 Chariot élévateur" },
  { v: "allergens", l: "🚫 Allergènes" },
  { v: "gdpr", l: "📋 RGPD" },
  { v: "other", l: "📦 Autre" },
];

export function AddTrainingButton({ employees }: { employees: Array<{ id: string; full_name: string }> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [empId, setEmpId] = useState("");
  const [kind, setKind] = useState("haccp");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [obtainedAt, setObtainedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState("");
  const [level, setLevel] = useState("");
  const [score, setScore] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{ name: string; base64: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    const buf = await f.arrayBuffer();
    setFile({ name: f.name, base64: btoa(String.fromCharCode(...new Uint8Array(buf))), type: f.type });
  }

  function reset() {
    setEmpId(""); setKind("haccp"); setTitle(""); setProvider("");
    setObtainedAt(new Date().toISOString().slice(0, 10));
    setExpiresAt(""); setLevel(""); setScore(""); setHours(""); setNote("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    if (!empId || !title) { toast.error("Employé + titre obligatoires"); return; }
    startTransition(async () => {
      const r = await addTrainingAction({
        employeeId: empId, kind, title, provider: provider || undefined,
        obtainedAt, expiresAt: expiresAt || undefined,
        level: level || undefined,
        score: score ? parseFloat(score) : undefined,
        hoursCompleted: hours ? parseFloat(hours) : undefined,
        note: note || undefined,
        certificateBase64: file?.base64,
        certificateName: file?.name,
        certificateMime: file?.type,
      });
      if (r.ok) { toast.success("Formation ajoutée"); reset(); setOpen(false); }
      else toast.error(r.error ?? "KO");
    });
  }

  return (
    <>
      <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" /> Ajouter formation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouvelle formation</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label>Employé *</Label>
              <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface">
                <option value="">— Choisir —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <Label>Type *</Label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface">
                {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
              </select>
            </div>
            <div>
              <Label>Titre *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Ex: "HACCP niveau 1 — alimentaire"' />
            </div>
            <div>
              <Label>Organisme formateur</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Ex: AFSCA, Bruxelles Formation..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Obtenue le *</Label>
                <Input type="date" value={obtainedAt} onChange={(e) => setObtainedAt(e.target.value)} />
              </div>
              <div>
                <Label>Expire le (optionnel)</Label>
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Niveau</Label>
                <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="A1, A2, B1..." />
              </div>
              <div>
                <Label>Score %</Label>
                <Input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="85" />
              </div>
              <div>
                <Label>Heures</Label>
                <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="8" />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="border-2 border-dashed border-line rounded p-2">
              {file ? (
                <div className="text-xs flex items-center justify-between">
                  <span className="font-mono truncate">📎 {file.name}</span>
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-red-600 text-xs">×</button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full text-xs text-ink-3 hover:text-ink-1 py-2">
                  📎 Ajouter certificat (PDF/image) — max 10 MB
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} className="hidden" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="gold" onClick={submit} disabled={pending || !empId || !title}>
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
